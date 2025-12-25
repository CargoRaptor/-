
import React, { useState, useEffect } from 'react';
import { TNVEDCode, CalculationResult, ShippingMethod, Currency, ExchangeRates } from '../types';
import { TNVED_DB } from '../data/tnved_db';

interface CalculatorProps {
  selectedCode: TNVEDCode | null;
  onCodeChange?: (code: string) => void;
  rates: ExchangeRates;
  ratesUI: { USD: string; CNY: string; EUR: string };
  onRateChange: (key: 'USD' | 'CNY' | 'EUR', value: string) => void;
}

const DENSITY_COEFFICIENTS: Record<ShippingMethod, number> = {
  Air: 167,
  Road: 250,
  Rail: 300,
  Sea: 1000
};

const SHIPPING_TIERS: Record<ShippingMethod, { min: number; rate: number }[]> = {
  Air: [
    { min: 1000, rate: 4.2 },
    { min: 300, rate: 4.8 },
    { min: 100, rate: 5.5 },
    { min: 50, rate: 6.5 },
    { min: 0, rate: 8.0 }
  ],
  Road: [
    { min: 1000, rate: 2.5 },
    { min: 300, rate: 3.0 },
    { min: 100, rate: 3.5 },
    { min: 50, rate: 4.5 },
    { min: 0, rate: 5.5 }
  ],
  Rail: [
    { min: 1000, rate: 1.5 },
    { min: 300, rate: 2.0 },
    { min: 100, rate: 2.5 },
    { min: 50, rate: 3.0 },
    { min: 0, rate: 4.0 }
  ],
  Sea: [
    { min: 1000, rate: 1.0 },
    { min: 300, rate: 1.5 },
    { min: 100, rate: 2.0 },
    { min: 50, rate: 2.5 },
    { min: 0, rate: 3.5 }
  ]
};

const SHIPPING_LABELS: Record<ShippingMethod, string> = {
  Sea: 'Море',
  Rail: 'Ж/Д',
  Road: 'Авто',
  Air: 'Авиа'
};

const POPULAR_ITEMS = TNVED_DB.slice(0, 10);

export const Calculator: React.FC<CalculatorProps> = ({ 
  selectedCode, 
  onCodeChange, 
  rates, 
  ratesUI,
  onRateChange
}) => {
  const [manualCode, setManualCode] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  
  // Строковые стейты для поддержки гибкого ввода (пробелы, точки, запятые)
  const [invoiceValueStr, setInvoiceValueStr] = useState<string>('5000');
  const [weightStr, setWeightStr] = useState<string>('100');
  const [volumeStr, setVolumeStr] = useState<string>('1');
  const [quantityStr, setQuantityStr] = useState<string>('1');
  const [dutyRateStr, setDutyRateStr] = useState<string>('0');
  const [vatRateStr, setVatRateStr] = useState<string>('20');
  
  const [selectedShippingMethods, setSelectedShippingMethods] = useState<ShippingMethod[]>(['Road']);
  const [hasInsurance, setHasInsurance] = useState(true);
  const [result, setResult] = useState<CalculationResult | null>(null);

  // Хелпер для парсинга чисел из "грязных" строк
  const parseNum = (val: string): number => {
    const clean = val.replace(/\s/g, '').replace(',', '.');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Валидатор ввода (разрешает цифры, пробелы, точки и запятые)
  const handleInputChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (/^[0-9\s.,]*$/.test(val) || val === '') {
      setter(val);
    }
  };

  useEffect(() => {
    if (selectedCode) {
      setManualCode(selectedCode.code);
      setDutyRateStr(selectedCode.importDuty.toString());
      setVatRateStr(selectedCode.vat.toString());
    }
  }, [selectedCode]);

  const toRUB = (val: number, from: Currency): number => {
    if (from === 'RUB') return val;
    if (from === 'USD') return val * rates.USD;
    if (from === 'CNY') return val * rates.CNY;
    if (from === 'EUR') return val * rates.EUR;
    return val;
  };

  const toUSD = (val: number, from: Currency): number => {
    if (from === 'USD') return val;
    if (from === 'RUB') return val / rates.USD;
    if (from === 'CNY') return (val * rates.CNY) / rates.USD;
    if (from === 'EUR') return (val * rates.EUR) / rates.USD;
    return val;
  };

  useEffect(() => {
    const invoiceValue = parseNum(invoiceValueStr);
    const weight = parseNum(weightStr);
    const volume = parseNum(volumeStr);
    const dutyRate = parseNum(dutyRateStr);
    const vatRate = parseNum(vatRateStr);

    const invoiceUSD = toUSD(invoiceValue, currency);
    const invoiceRUB = toRUB(invoiceValue, currency);
    const insuranceUSD = hasInsurance ? invoiceUSD * 0.002 : 0;
    const insuranceRUB = insuranceUSD * rates.USD;
    
    const customsValueRUB = invoiceRUB + insuranceRUB;
    
    const exciseRate = selectedCode?.excise ?? 0;
    const dutyRUB = (customsValueRUB * dutyRate) / 100;
    const exciseRUB = (customsValueRUB * exciseRate) / 100;
    
    const vatRUB = ((customsValueRUB + dutyRUB + exciseRUB) * vatRate) / 100;
    const totalTaxesRUB = dutyRUB + vatRUB + exciseRUB + 10000;

    const bankCommissionRUB = invoiceRUB * 0.03;

    let totalShippingUSD = 0;
    selectedShippingMethods.forEach(method => {
      const k = DENSITY_COEFFICIENTS[method];
      const volWeight = volume * k;
      const chargeableWeight = Math.max(weight, volWeight);
      const tier = SHIPPING_TIERS[method].find(t => chargeableWeight >= t.min);
      const ratePerKg = tier ? tier.rate : SHIPPING_TIERS[method][SHIPPING_TIERS[method].length - 1].rate;
      totalShippingUSD += (chargeableWeight * ratePerKg) + 150;
    });
    const totalShippingRUB = totalShippingUSD * rates.USD;

    const localServicesRUB = 20000 + 35000;
    const grandTotalRUB = customsValueRUB + totalTaxesRUB + bankCommissionRUB + totalShippingRUB + localServicesRUB;

    setResult({
      productValue: invoiceRUB,
      insuranceAmount: insuranceRUB,
      totalCustomsValue: customsValueRUB,
      importDutyAmount: dutyRUB,
      vatAmount: vatRUB,
      exciseAmount: exciseRUB,
      totalTaxes: totalTaxesRUB,
      bankCommission: bankCommissionRUB,
      shippingCost: totalShippingRUB,
      localServices: localServicesRUB,
      grandTotal: grandTotalRUB
    });
  }, [selectedCode, invoiceValueStr, weightStr, volumeStr, dutyRateStr, vatRateStr, hasInsurance, selectedShippingMethods, currency, rates]);

  const formatValue = (val: number) => {
    return val.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const currentInputSymbol = currency === 'RUB' ? '₽' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '¥';
  const currentQuantity = parseNum(quantityStr) || 1;

  return (
    <div id="calculator-top" className="w-full space-y-12">
      <div className="bg-[#F8FAFC]/50 p-8 md:p-12 rounded-[2.5rem] border border-slate-50 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-12">
          <div className="flex items-start gap-4">
            <div className="p-4 bg-yellow-400/10 text-yellow-500 rounded-2xl">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Параметры груза</h2>
              <p className="text-sm text-slate-400 font-medium">Обновляемые курсы валют</p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex flex-col min-w-[70px]">
              <span className="text-[9px] font-black text-slate-300 uppercase tracking-wider px-2">USD</span>
              <input type="text" value={ratesUI.USD} onChange={(e) => onRateChange('USD', e.target.value)} className="w-16 bg-transparent border-none py-1 px-2 text-sm font-bold text-slate-900 focus:ring-0 outline-none"/>
            </div>
            <div className="w-px h-8 bg-slate-100"></div>
            <div className="flex flex-col min-w-[70px]">
              <span className="text-[9px] font-black text-slate-300 uppercase tracking-wider px-2">CNY</span>
              <input type="text" value={ratesUI.CNY} onChange={(e) => onRateChange('CNY', e.target.value)} className="w-16 bg-transparent border-none py-1 px-2 text-sm font-bold text-slate-900 focus:ring-0 outline-none"/>
            </div>
            <div className="w-px h-8 bg-slate-100"></div>
            <div className="flex flex-col min-w-[70px]">
              <span className="text-[9px] font-black text-slate-300 uppercase tracking-wider px-2">EUR</span>
              <input type="text" value={ratesUI.EUR} onChange={(e) => onRateChange('EUR', e.target.value)} className="w-16 bg-transparent border-none py-1 px-2 text-sm font-bold text-slate-900 focus:ring-0 outline-none"/>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-y-10 gap-x-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">Код ТН ВЭД</label>
            <input type="text" value={manualCode} onChange={(e) => setManualCode(e.target.value)} className="w-full bg-white border border-slate-100 rounded-2xl py-5 px-6 text-slate-900 font-mono font-bold outline-none focus:border-yellow-400"/>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">Пошлина (%)</label>
            <input type="text" value={dutyRateStr} onChange={handleInputChange(setDutyRateStr)} className="w-full bg-white border border-slate-100 rounded-2xl py-5 px-6 text-slate-900 font-bold outline-none"/>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">НДС (%)</label>
            <input type="text" value={vatRateStr} onChange={handleInputChange(setVatRateStr)} className="w-full bg-white border border-slate-100 rounded-2xl py-5 px-6 text-slate-900 font-bold outline-none"/>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">Инвойс ({currency})</label>
            <div className="relative group">
              <div className="absolute -top-1 right-0 flex bg-white border border-slate-100 rounded-lg p-0.5 z-10 scale-90 origin-top-right">
                {(['USD', 'CNY', 'EUR', 'RUB'] as Currency[]).map((curr) => (
                  <button 
                    key={curr} 
                    type="button"
                    onClick={() => setCurrency(curr)}
                    className={`px-2 py-1 text-[9px] font-black rounded-md transition-all ${currency === curr ? 'bg-yellow-400 text-slate-900' : 'text-slate-300 hover:text-slate-400'}`}
                  >
                    {curr}
                  </button>
                ))}
              </div>
              <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 font-bold">{currentInputSymbol}</span>
              <input type="text" value={invoiceValueStr} onChange={handleInputChange(setInvoiceValueStr)} className="w-full bg-white border border-slate-100 rounded-2xl py-5 pl-12 pr-6 text-slate-900 font-black outline-none"/>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">Вес (кг) / Объем (м³)</label>
            <div className="flex gap-2">
              <input type="text" value={weightStr} onChange={handleInputChange(setWeightStr)} className="w-1/2 bg-white border border-slate-100 rounded-2xl py-5 px-4 text-slate-900 font-bold outline-none" placeholder="кг"/>
              <input type="text" value={volumeStr} onChange={handleInputChange(setVolumeStr)} className="w-1/2 bg-white border border-slate-100 rounded-2xl py-5 px-4 text-slate-900 font-bold outline-none" placeholder="м³"/>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">Количество (шт)</label>
            <input type="text" value={quantityStr} onChange={handleInputChange(setQuantityStr)} className="w-full bg-white border border-slate-100 rounded-2xl py-5 px-6 text-slate-900 font-bold outline-none" placeholder="Кол-во"/>
          </div>
        </div>

        <div className="mt-12 space-y-4">
          <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">Способ доставки и опции</label>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-wrap gap-4">
              {(['Air', 'Road', 'Rail', 'Sea'] as ShippingMethod[]).map(method => (
                <button key={method} onClick={() => setSelectedShippingMethods([method])} className={`px-8 py-5 rounded-2xl border-2 font-black transition-all ${selectedShippingMethods.includes(method) ? 'bg-yellow-400 border-yellow-400 text-slate-900' : 'bg-white border-slate-50 text-slate-300 hover:border-slate-100'}`}>
                  {SHIPPING_LABELS[method]}
                </button>
              ))}
            </div>
            
            <div 
              onClick={() => setHasInsurance(!hasInsurance)}
              className="bg-white p-4 h-[64px] rounded-2xl border border-slate-100 flex items-center gap-4 cursor-pointer hover:border-blue-200 transition-colors shadow-sm"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${hasInsurance ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-300'}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-black text-slate-800">Страхование</span>
                <span className="text-[10px] text-slate-400 font-bold">0.2% от инвойса</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {result && (
        <div className="w-full space-y-8 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
              <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest pb-4 border-b border-slate-50">ТАМОЖНЯ ({parseNum(dutyRateStr)}% + {parseNum(vatRateStr)}%)</h4>
              <div className="space-y-4 text-sm font-bold">
                <div className="flex justify-between text-slate-400">
                  <span>Таможенная пошлина:</span>
                  <span className="text-slate-900">₽{formatValue(result.importDutyAmount)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Таможенное оформление:</span>
                  <span className="text-slate-900">10 000 ₽</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Ввозной НДС:</span>
                  <span className="text-slate-900">₽{formatValue(result.vatAmount)}</span>
                </div>
                <div className="flex justify-between pt-4 border-t border-slate-50 text-lg font-black text-slate-950">
                  <span>Итого налоги:</span>
                  <span>₽{formatValue(result.totalTaxes)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
              <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest pb-4 border-b border-slate-50">ЛОГИСТИКА И КОМИССИИ</h4>
              <div className="space-y-4 text-sm font-bold">
                <div className="flex justify-between text-slate-400">
                  <span>Доставка ({SHIPPING_LABELS[selectedShippingMethods[0]]}):</span>
                  <span className="text-slate-900">₽{formatValue(result.shippingCost)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Банк (3%):</span>
                  <span className="text-slate-900">₽{formatValue(result.bankCommission)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Страховка (0.2%):</span>
                  <span className="text-slate-900">₽{formatValue(result.insuranceAmount)}</span>
                </div>
                <div className="flex justify-between pt-4 border-t border-slate-50 text-lg font-black text-blue-600">
                  <span>Всего доп:</span>
                  <span>₽{formatValue(result.shippingCost + result.bankCommission + result.insuranceAmount)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
              <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest pb-4 border-b border-slate-50">ЛОКАЛЬНЫЕ УСЛУГИ</h4>
              <div className="space-y-4 text-sm font-bold">
                <div className="flex justify-between text-slate-400">
                  <span>Услуги декларанта:</span>
                  <span className="text-slate-900">20 000 ₽</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Агентское вознаграждение:</span>
                  <span className="text-slate-900">35 000 ₽</span>
                </div>
                <div className="flex justify-between pt-4 border-t border-slate-50 text-lg font-black text-emerald-600">
                  <span>Итого в ₽:</span>
                  <span>₽{formatValue(result.localServices)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 p-12 rounded-[3rem] text-center text-white relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-400/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-yellow-400/20 transition-all"></div>
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4 block">ОРИЕНТИРОВОЧНАЯ СТОИМОСТЬ ПОД КЛЮЧ</span>
            <div className="text-6xl md:text-7xl font-black text-yellow-400 tracking-tighter mb-1">
              <span className="text-3xl font-medium mr-2">₽</span>
              {formatValue(result.grandTotal)}
            </div>
            <div className="text-xl md:text-2xl font-bold text-slate-400 mb-6">
              ~ ₽{formatValue(Math.round(result.grandTotal / currentQuantity))} за единицу
            </div>
            <p className="text-xs text-slate-500 font-medium max-w-xl mx-auto">
              Расчет является предварительным. Точную стоимость с учетом всех специфических требований груза подтвердит менеджер после проверки документов.
            </p>
          </div>
        </div>
      )}

      <div className="pt-20 border-t border-slate-100">
        <h3 className="text-2xl font-black text-slate-900 mb-10 flex items-center gap-4">
          <div className="w-1.5 h-8 bg-yellow-400 rounded-full"></div>
          10 самых популярных товаров
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {POPULAR_ITEMS.map((item) => (
            <div key={item.code} className="bg-white border border-slate-100 p-8 rounded-[2.5rem] hover:shadow-2xl hover:border-yellow-400/30 transition-all group flex flex-col h-full">
              <span className="font-mono text-[10px] text-slate-300 font-bold mb-4">{item.code}</span>
              <h4 className="text-xl font-black text-slate-900 mb-2 group-hover:text-yellow-600 transition-colors">{item.name}</h4>
              <p className="text-sm text-slate-400 font-medium mb-8 leading-relaxed">{item.description}</p>
              <div className="mt-auto pt-6 border-t border-slate-50 flex items-center justify-between">
                <div className="flex gap-6">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-300 uppercase">Пошлина</span>
                    <span className="text-base font-black text-slate-900">{item.importDuty}%</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-300 uppercase">НДС</span>
                    <span className="text-base font-black text-blue-600">{item.vat}%</span>
                  </div>
                </div>
                <button onClick={() => onCodeChange?.(item.code)} className="p-4 bg-slate-950 text-white rounded-2xl hover:bg-yellow-400 hover:text-slate-950 transition-all active:scale-95">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
