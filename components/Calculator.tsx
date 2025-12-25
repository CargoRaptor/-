
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
  Air: [{ min: 1000, rate: 4.2 }, { min: 300, rate: 4.8 }, { min: 100, rate: 5.5 }, { min: 50, rate: 6.5 }, { min: 0, rate: 8.0 }],
  Road: [{ min: 1000, rate: 2.5 }, { min: 300, rate: 3.0 }, { min: 100, rate: 3.5 }, { min: 50, rate: 4.5 }, { min: 0, rate: 5.5 }],
  Rail: [{ min: 1000, rate: 1.5 }, { min: 300, rate: 2.0 }, { min: 100, rate: 2.5 }, { min: 50, rate: 3.0 }, { min: 0, rate: 4.0 }],
  // Sea rates are exactly 5% cheaper than Rail (Rate * 0.95)
  Sea: [{ min: 1000, rate: 1.425 }, { min: 300, rate: 1.9 }, { min: 100, rate: 2.375 }, { min: 50, rate: 2.85 }, { min: 0, rate: 3.8 }]
};

const SHIPPING_LABELS: Record<ShippingMethod, string> = { Sea: 'Море', Rail: 'Ж/Д', Road: 'Авто', Air: 'Авиа' };

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
  const [departure, setDeparture] = useState('Гуанчжоу, Китай');
  const [arrival, setArrival] = useState('Москва, РФ');

  const [invoiceValueStr, setInvoiceValueStr] = useState<string>('5000');
  const [weightStr, setWeightStr] = useState<string>('100');
  const [volumeStr, setVolumeStr] = useState<string>('1');
  const [quantityStr, setQuantityStr] = useState<string>('1');
  const [dutyRateStr, setDutyRateStr] = useState<string>('0');
  const [vatRateStr, setVatRateStr] = useState<string>('20');
  
  const [selectedShippingMethod, setSelectedShippingMethod] = useState<ShippingMethod>('Road');
  const [hasInsurance, setHasInsurance] = useState(true);
  const [result, setResult] = useState<CalculationResult | null>(null);

  const parseNum = (val: string): number => {
    const clean = val.replace(/\s/g, '').replace(',', '.');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  };

  const handleInputChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (/^[0-9\s.,]*$/.test(val) || val === '') setter(val);
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
    
    // ЛОГИКА КОМБИНИРОВАННОЙ ПОШЛИНЫ
    const dutyByPercentRUB = (customsValueRUB * dutyRate) / 100;
    
    let dutyRUB = dutyByPercentRUB;
    if (selectedCode?.minDutyAmount && selectedCode.minDutyCurrency) {
      const minRateInRUB = toRUB(selectedCode.minDutyAmount, selectedCode.minDutyCurrency);
      const dutyByWeightRUB = weight * minRateInRUB;
      dutyRUB = Math.max(dutyByPercentRUB, dutyByWeightRUB);
    }

    const exciseRate = selectedCode?.excise ?? 0;
    const exciseRUB = (customsValueRUB * exciseRate) / 100;
    const vatRUB = ((customsValueRUB + dutyRUB + exciseRUB) * vatRate) / 100;
    const totalTaxesRUB = dutyRUB + vatRUB + exciseRUB + 10000;

    const bankCommissionRUB = invoiceRUB * 0.03;

    const k = DENSITY_COEFFICIENTS[selectedShippingMethod];
    const volWeight = volume * k;
    const chargeableWeight = Math.max(weight, volWeight);
    const tier = SHIPPING_TIERS[selectedShippingMethod].find(t => chargeableWeight >= t.min);
    const ratePerKg = tier ? tier.rate : 1;
    
    // Base fee is also 5% cheaper for Sea ($150 * 0.95 = $142.5)
    const baseShippingFeeUSD = selectedShippingMethod === 'Sea' ? 142.5 : 150;
    const totalShippingUSD = (countableWeight => (countableWeight * ratePerKg) + baseShippingFeeUSD)(chargeableWeight);
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
  }, [selectedCode, invoiceValueStr, weightStr, volumeStr, dutyRateStr, vatRateStr, hasInsurance, selectedShippingMethod, currency, rates]);

  const formatValue = (val: number) => val.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

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
              <p className="text-sm text-slate-400 font-medium">Курс: 1 USD = {rates.USD}₽ / 1 EUR = {rates.EUR}₽</p>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10 pb-10 border-b border-slate-100">
           <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">Пункт отправления</label>
            <input type="text" value={departure} onChange={(e) => setDeparture(e.target.value)} className="w-full bg-white border border-slate-100 rounded-2xl py-5 px-6 text-slate-900 font-bold outline-none"/>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">Пункт назначения</label>
            <input type="text" value={arrival} onChange={(e) => setArrival(e.target.value)} className="w-full bg-white border border-slate-100 rounded-2xl py-5 px-6 text-slate-900 font-bold outline-none"/>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-y-10 gap-x-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">Код ТН ВЭД</label>
            <input type="text" value={manualCode} onChange={(e) => setManualCode(e.target.value)} className="w-full bg-white border border-slate-100 rounded-2xl py-5 px-6 text-slate-900 font-mono font-bold outline-none"/>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">Таможенная пошлина</label>
            <div className="relative">
              <input type="text" value={dutyRateStr} onChange={handleInputChange(setDutyRateStr)} className="w-full bg-white border border-slate-100 rounded-2xl py-5 px-6 text-slate-900 font-bold outline-none"/>
              {selectedCode?.minDutyAmount && (
                <div className="absolute top-full mt-1 left-1 text-[9px] font-bold text-orange-500 whitespace-nowrap">
                  Мин: {selectedCode.minDutyAmount} {selectedCode.minDutyCurrency} / кг
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">Ввозной НДС В %</label>
            <input type="text" value={vatRateStr} onChange={handleInputChange(setVatRateStr)} className="w-full bg-white border border-slate-100 rounded-2xl py-5 px-6 text-slate-900 font-bold outline-none"/>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">Инвойс ({currency})</label>
            <div className="relative group">
              <div className="absolute -top-1 right-0 flex bg-white border border-slate-100 rounded-lg p-0.5 z-10 scale-90 origin-top-right">
                {(['USD', 'CNY', 'EUR', 'RUB'] as Currency[]).map((curr) => (
                  <button key={curr} type="button" onClick={() => setCurrency(curr)} className={`px-2 py-1 text-[9px] font-black rounded-md transition-all ${currency === curr ? 'bg-yellow-400 text-slate-900' : 'text-slate-300 hover:text-slate-400'}`}>
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
          <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">Способ доставки</label>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-wrap gap-4">
              {(['Air', 'Road', 'Rail', 'Sea'] as const).map(method => (
                <button key={method} onClick={() => setSelectedShippingMethod(method)} className={`px-8 py-5 rounded-2xl border-2 font-black transition-all flex items-center gap-3 ${selectedShippingMethod === method ? 'bg-yellow-400 border-yellow-400 text-slate-900' : 'bg-white border-slate-50 text-slate-300 hover:border-slate-100'}`}>
                  {SHIPPING_LABELS[method]}
                </button>
              ))}
            </div>
            <div onClick={() => setHasInsurance(!hasInsurance)} className="bg-white p-4 h-[64px] rounded-2xl border border-slate-100 flex items-center gap-4 cursor-pointer hover:border-blue-200 shadow-sm transition-all">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${hasInsurance ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-300'}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
              </div>
              <span className="text-sm font-black text-slate-800">Страховка 0.2%</span>
            </div>
          </div>
        </div>
      </div>

      {result && (
        <div className="w-full space-y-8 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest pb-4 border-b border-slate-50 mb-6 uppercase">Таможенные платежи</h4>
              <div className="space-y-4 text-sm font-bold">
                <div className="flex justify-between text-slate-400">
                  <span>Таможенная пошлина {selectedCode?.minDutyAmount && '(комби)'}::</span>
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
                  <span>Сума налоговых платежей:</span>
                  <span>₽{formatValue(result.totalTaxes)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest pb-4 border-b border-slate-50 mb-6 uppercase">Доставка, комиссия банка и страховка</h4>
              <div className="space-y-4 text-sm font-bold">
                <div className="flex justify-between text-slate-400">
                  <span>Доставка:</span>
                  <span className="text-slate-900">₽{formatValue(result.shippingCost)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Комиссия банка:</span>
                  <span className="text-slate-900">₽{formatValue(result.bankCommission)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Страховка:</span>
                  <span className="text-slate-900">₽{formatValue(result.insuranceAmount)}</span>
                </div>
                <div className="flex justify-between pt-4 border-t border-slate-50 text-lg font-black text-blue-600">
                  <span>Итоговая стоимость логистики, комисстий банка, страховки:</span>
                  <span>₽{formatValue(result.shippingCost + result.bankCommission + result.insuranceAmount)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest pb-4 border-b border-slate-50 mb-6 uppercase">Агентские услуги</h4>
              <div className="space-y-4 text-sm font-bold">
                <div className="flex justify-between text-slate-400">
                  <span>Декларант:</span>
                  <span className="text-slate-900">20 000 ₽</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Агентское вознаграждение:</span>
                  <span className="text-slate-900">35 000 ₽</span>
                </div>
                <div className="flex justify-between pt-4 border-t border-slate-50 text-lg font-black text-emerald-600">
                  <span>Стоимость агентских услуг:</span>
                  <span>₽{formatValue(result.localServices)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 p-12 rounded-[3rem] text-center text-white relative overflow-hidden group shadow-2xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-400/10 rounded-full blur-3xl group-hover:bg-yellow-400/20 transition-all"></div>
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4 block">ОРИЕНТИРОВОЧНАЯ СТОИМОСТЬ ПОД КЛЮЧ</span>
            <div className="text-6xl md:text-7xl font-black text-yellow-400 tracking-tighter mb-1">
              <span className="text-3xl font-medium mr-2">₽</span>
              {formatValue(result.grandTotal)}
            </div>
            <div className="text-xl md:text-2xl font-bold text-slate-400 mb-2">
              ~ ₽{formatValue(Math.round(result.grandTotal / currentQuantity))} за единицу
            </div>
            <div className="text-[10px] md:text-xs text-slate-500 font-medium max-w-md mx-auto leading-relaxed">
              Расчет ориентировочный. Не является публичной офертой. Точную ставку подтвердит менеджер.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
