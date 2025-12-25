
import React, { useState } from 'react';
import { TNVEDCode, ExchangeRates } from './types';
import { Calculator } from './components/Calculator';
import { TNVED_DB } from './data/tnved_db';

const POPULAR_LIBRARY: TNVEDCode[] = TNVED_DB.slice(0, 4);

const App: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCode, setSelectedCode] = useState<TNVEDCode | null>(POPULAR_LIBRARY[0]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<TNVEDCode[]>([]);
  
  // Используем строки для UI-состояния курсов, чтобы сохранять пробелы и запятые при вводе
  const [ratesUI, setRatesUI] = useState({
    USD: '91.8',
    CNY: '12.7',
    EUR: '98.5'
  });

  const handleRateChange = (key: 'USD' | 'CNY' | 'EUR', value: string) => {
    // Разрешаем вводить только цифры, точки, запятые и пробелы
    if (/^[0-9\s.,]*$/.test(value) || value === '') {
      setRatesUI(prev => ({ ...prev, [key]: value }));
    }
  };

  // Вычисляемые числовые курсы для логики
  const parseNum = (val: string) => {
    const clean = val.replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(clean);
    return isNaN(n) ? 0 : n;
  };

  const rates: ExchangeRates = {
    USD: parseNum(ratesUI.USD),
    CNY: parseNum(ratesUI.CNY),
    EUR: parseNum(ratesUI.EUR),
    date: new Date().toLocaleDateString('ru-RU')
  };

  const handleSearchLocal = (query: string) => {
    if (!query.trim()) return [];
    const lowerQuery = query.toLowerCase();
    
    return TNVED_DB.filter(item => {
      return (
        item.code.includes(lowerQuery) ||
        item.name.toLowerCase().includes(lowerQuery) ||
        item.description.toLowerCase().includes(lowerQuery)
      );
    }).slice(0, 20);
  };

  const triggerSearch = (query: string) => {
    setIsSearching(true);
    setSearchResults([]);
    
    setTimeout(() => {
      const results = handleSearchLocal(query);
      setSearchResults(results);
      setIsSearching(false);
      if (results.length > 0) {
        document.getElementById('search-results-anchor')?.scrollIntoView({ behavior: 'smooth' });
      }
    }, 300);
  };

  const handleSearchClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    triggerSearch(searchQuery);
  };

  const selectProduct = (item: TNVEDCode) => {
    setSelectedCode(item);
    setTimeout(() => {
      document.getElementById('calculator-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  return (
    <div className="w-full bg-slate-50 min-h-screen pb-20 font-sans selection:bg-yellow-200">
      <div className="max-w-7xl mx-auto px-4 pt-12 md:pt-24">
        <div className="bg-[#0f172a] rounded-[3rem] p-8 md:p-24 text-white relative overflow-hidden shadow-2xl flex flex-col items-center justify-center">
          <div className="relative z-10 max-w-4xl mx-auto text-center w-full">
            <div className="inline-flex items-center justify-center border border-yellow-400/20 bg-yellow-400/5 px-6 py-2 rounded-full mb-12">
               <span className="text-[10px] font-black text-yellow-400 uppercase tracking-[0.2em]">
                 КАЛЬКУЛЯТОР ПРЕДВАРИТЕЛЬНЫХ РАСЧЕТОВ CARGORAPTOR
               </span>
            </div>
            <h1 className="text-4xl md:text-7xl font-black mb-6 leading-tight tracking-tight">
              Найдите код в <span className="text-yellow-400 italic">базе</span>
            </h1>
            <p className="text-slate-400 text-lg md:text-xl font-medium mb-12 max-w-2xl mx-auto leading-relaxed opacity-80">
              Поиск по актуальным кодам ТН ВЭД. Используйте точный код или описание товара.
            </p>
            <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full">
              <form onSubmit={handleSearchClick} className="relative flex items-center bg-[#1e293b]/40 border border-slate-700/50 rounded-full p-2 pl-8 focus-within:border-yellow-400/50 transition-all shadow-inner backdrop-blur-sm">
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Например: электросамокат или 8703"
                  className="flex-grow bg-transparent border-none py-4 text-white text-lg placeholder:text-slate-500 focus:outline-none"
                />
                <button 
                  type="submit"
                  disabled={isSearching}
                  className="bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-black px-12 py-4 rounded-full transition-all active:scale-95 disabled:opacity-70 text-lg shadow-lg"
                >
                  {isSearching ? "..." : "Найти"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <div id="search-results-anchor"></div>

      {(isSearching || searchResults.length > 0) && (
        <div className="max-w-7xl mx-auto px-4 mt-20">
          <div className="flex items-center gap-4 mb-10">
            <div className="w-2 h-10 rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]"></div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Результаты поиска</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-start">
            {isSearching ? (
              [1, 2, 3].map(i => (
                <div key={i} className="h-[280px] bg-white rounded-[3rem] border border-slate-100 animate-pulse p-8"></div>
              ))
            ) : (
              searchResults.map((item, idx) => (
                <div key={`${item.code}-${idx}`} className={`group relative p-8 rounded-[3.5rem] border-2 transition-all hover:shadow-2xl flex flex-col h-full ${selectedCode?.code === item.code ? 'border-emerald-400 bg-emerald-50/30' : 'border-white bg-white'}`}>
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-6">
                      <span className="text-[10px] font-black uppercase text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full">{item.category}</span>
                      <div className="font-mono text-sm text-emerald-600 font-black bg-emerald-500/10 px-3 py-1.5 rounded-xl">{item.code}</div>
                    </div>
                    <h3 className="font-black text-slate-900 text-xl mb-3 leading-snug">{item.name}</h3>
                    <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">{item.description}</p>
                    <div className="flex items-center gap-8 py-6 border-y border-slate-50 mt-auto mb-6">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-400 uppercase">Пошлина</span>
                        <span className="text-lg font-black text-slate-900">{item.importDuty}%</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-400 uppercase">НДС</span>
                        <span className="text-lg font-black text-blue-600">{item.vat}%</span>
                      </div>
                    </div>
                    <button onClick={() => selectProduct(item)} className="w-full py-5 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-2xl transition-all active:scale-95 text-xs uppercase tracking-widest">
                      Добавить в расчет
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div id="calculator-section" className="max-w-7xl mx-auto px-4 mt-20">
        <Calculator 
          rates={rates}
          // Передаем строковые значения для отображения в инпутах
          ratesUI={ratesUI}
          onRateChange={handleRateChange}
          selectedCode={selectedCode} 
          onCodeChange={(code) => {
            const found = TNVED_DB.find(l => l.code === code);
            if (found) setSelectedCode(found);
            setTimeout(() => {
              document.getElementById('calculator-section')?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          }}
        />
      </div>
    </div>
  );
};

export default App;
