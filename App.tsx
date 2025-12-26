
import React, { useState, useEffect, useMemo } from 'react';
import { TNVEDCode, ExchangeRates } from './types';
import { Calculator } from './components/Calculator';
import { TNVED_DB } from './data/tnved_db';
import { SYNONYMS } from './data/search_maps';

const POPULAR_LIBRARY: TNVEDCode[] = TNVED_DB.slice(0, 4);

const STOP_WORDS = new Set([
  'для', 'из', 'под', 'над', 'без', 'при', 'все', 'эти', 'этот', 'какой', 'такой', 
  'сверху', 'снизу', 'внутри', 'комплект', 'набор', 'шт', 'кг', 'с', 'и', 'в', 'на',
  'бывший', 'новые', 'прочие', 'прочая', 'включая', 'кроме', 'использования', 'предназначенный'
]);

const App: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCode, setSelectedCode] = useState<TNVEDCode | null>(POPULAR_LIBRARY[0]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<TNVEDCode[]>([]);
  const [viewingProduct, setViewingProduct] = useState<TNVEDCode | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [showScrollToSearch, setShowScrollToSearch] = useState(false);
  
  const [ratesUI, setRatesUI] = useState({
    USD: '91.8',
    CNY: '12.7',
    EUR: '98.5'
  });

  // Улучшенный стеммер: очищаем слово для поиска
  function getStem(word: string): string {
    return word
      .toLowerCase()
      .trim()
      .replace(/[.,!?;:]/g, '')
      .replace(/(иями|ями|иям|ям|иях|ях|овая|овое|овый|очные|очный|ов|ев|ий|ый|ая|ое|ые|ие|ия|ой|ей|ам|ом|а|и|ы|е|у|ю|ь|я|с)$/g, '');
  }

  // Индексация синонимов (Search Maps)
  const stemToPrefixes = useMemo(() => {
    const map: Record<string, string[]> = {};
    Object.entries(SYNONYMS).forEach(([prefix, terms]) => {
      terms.forEach(term => {
        const s = term.toLowerCase().trim();
        if (s.length < 2) return;
        if (!map[s]) map[s] = [];
        map[s].push(prefix);
      });
    });
    return map;
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const searchSection = document.getElementById('search-area');
      if (searchSection) {
        const rect = searchSection.getBoundingClientRect();
        setShowScrollToSearch(rect.bottom < 0);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewingProduct(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleRateChange = (key: 'USD' | 'CNY' | 'EUR', value: string) => {
    if (/^[0-9\s.,]*$/.test(value) || value === '') {
      setRatesUI(prev => ({ ...prev, [key]: value }));
    }
  };

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
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length < 2) return [];

    const queryWords = trimmed.split(/\s+/).filter(w => w.length >= 2 && !STOP_WORDS.has(w));
    if (queryWords.length === 0) return [];
    
    const queryStems = queryWords.map(w => getStem(w));

    // 1. Поиск кодов в SYNONYMS (Карта поиска)
    const codePrefixWeights = new Map<string, number>();
    queryStems.forEach((qStem, qIdx) => {
      const importance = qIdx === 0 ? 2.0 : 1.0;
      
      Object.keys(stemToPrefixes).forEach(mapStem => {
        // Двустороннее сравнение: корень из карты есть в запросе ИЛИ запрос начинается с корня из карты
        if (qStem.includes(mapStem) || mapStem.includes(qStem)) {
          stemToPrefixes[mapStem].forEach(prefix => {
            const current = codePrefixWeights.get(prefix) || 0;
            const matchQuality = mapStem === qStem ? 1 : 0.8;
            codePrefixWeights.set(prefix, current + (1000 * importance * matchQuality));
          });
        }
      });
    });

    // 2. Скоринг товаров из TNVED_DB
    const scoredResults = TNVED_DB.map(item => {
      let score = 0;
      let subjectConfirmed = false;
      let matchedStemsCount = 0;

      const title = item.name.toLowerCase();
      const titleStems = title.split(/\s+/).map(w => getStem(w));
      const description = item.description.toLowerCase();

      // А) Вес из карты синонимов (Самый надежный способ подтверждения)
      codePrefixWeights.forEach((weight, prefix) => {
        if (item.code.startsWith(prefix)) {
          score += weight;
          subjectConfirmed = true; // Если код совпал с синонимами из карты - товар точно "тот самый"
        }
      });

      // Б) Вес из заголовка
      queryStems.forEach((qStem, qIdx) => {
        let wordFound = false;
        const isPrimary = qIdx === 0;

        if (titleStems.some(ts => ts.includes(qStem) || qStem.includes(ts))) {
          score += isPrimary ? 3000 : 1200;
          wordFound = true;
          subjectConfirmed = true;
        }

        if (description.includes(qStem)) {
          score += 100; // Описанию даем мало веса
          wordFound = true;
        }

        if (wordFound) matchedStemsCount++;
      });

      // Фильтрация
      const matchDensity = matchedStemsCount / queryStems.length;
      // Релевантно, если предмет подтвержден И (одно слово совпало на 100% ИЛИ длинный запрос совпал на 40%)
      const isRelevant = subjectConfirmed && (queryStems.length === 1 ? score > 500 : matchDensity >= 0.4);

      return { item, score, isRelevant };
    });

    return scoredResults
      .filter(res => res.isRelevant)
      .sort((a, b) => b.score - a.score)
      .map(res => res.item)
      .slice(0, 30);
  };

  const triggerSearch = (query: string) => {
    setIsSearching(true);
    setSearchResults([]);
    setHasSearched(false);
    
    setTimeout(() => {
      const results = handleSearchLocal(query);
      setSearchResults(results);
      setIsSearching(false);
      setHasSearched(true);
      
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

  const scrollToSearch = () => {
    document.getElementById('search-area')?.scrollIntoView({ behavior: 'smooth' });
  };

  const showNoResultsHint = hasSearched && !isSearching && searchResults.length === 0;

  return (
    <div className="w-full bg-slate-50 min-h-screen pb-20 font-sans selection:bg-yellow-200">
      
      {showScrollToSearch && (
        <button 
          onClick={scrollToSearch}
          className="fixed bottom-8 right-8 z-[90] bg-slate-900 text-yellow-400 p-4 md:p-6 rounded-full shadow-2xl flex items-center gap-3 hover:scale-105 active:scale-95 transition-all animate-in slide-in-from-bottom-10"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <span className="hidden md:inline font-black uppercase text-xs tracking-widest">К поиску</span>
        </button>
      )}

      {viewingProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setViewingProduct(null)}></div>
          <div className="relative bg-white w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-[3rem] shadow-2xl p-8 md:p-12 animate-in zoom-in-95 duration-300">
            <button onClick={() => setViewingProduct(null)} className="absolute top-8 right-8 p-3 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full transition-all active:scale-90">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 px-4 py-2 rounded-full tracking-widest">{viewingProduct.category}</span>
                  <span className="font-mono text-sm font-black text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl">{viewingProduct.code}</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-black text-slate-900 leading-tight">{viewingProduct.name}</h2>
              </div>
              <div className="p-8 bg-slate-50 rounded-3xl border border-slate-100">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Полное описание ТН ВЭД</h4>
                <p className="text-lg text-slate-600 font-medium leading-relaxed italic">«{viewingProduct.description}»</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-emerald-500 p-8 rounded-[2.5rem] text-white shadow-lg shadow-emerald-200">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-2 block">Импортная пошлина</span>
                  <div className="text-5xl font-black">{viewingProduct.importDuty}%</div>
                </div>
                <div className="bg-blue-600 p-8 rounded-[2.5rem] text-white shadow-lg shadow-blue-200">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-2 block">Ставка НДС</span>
                  <div className="text-5xl font-black">{viewingProduct.vat}%</div>
                </div>
              </div>
              <button onClick={() => { selectProduct(viewingProduct); setViewingProduct(null); }} className="w-full py-6 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-2xl transition-all active:scale-95 text-lg uppercase tracking-widest shadow-xl">
                Выбрать для расчета
              </button>
            </div>
          </div>
        </div>
      )}

      <div id="search-area" className="max-w-7xl mx-auto px-4 pt-12 md:pt-24 scroll-mt-20">
        <div className="bg-[#0f172a] rounded-[3rem] p-8 md:p-24 text-white relative overflow-hidden shadow-2xl flex flex-col items-center justify-center">
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
             <div className="absolute -top-24 -left-24 w-96 h-96 bg-yellow-400 rounded-full blur-[120px]"></div>
             <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-blue-500 rounded-full blur-[120px]"></div>
          </div>
          <div className="relative z-10 max-w-4xl mx-auto text-center w-full">
            <div className="inline-flex items-center justify-center border border-yellow-400/20 bg-yellow-400/5 px-6 py-2 rounded-full mb-12">
               <span className="text-[10px] font-black text-yellow-400 uppercase tracking-[0.2em]">ИНТЕЛЛЕКТУАЛЬНЫЙ ПОИСК ТН ВЭД</span>
            </div>
            <h1 className="text-4xl md:text-7xl font-black mb-6 leading-tight tracking-tight">
              Найдите код в <span className="text-yellow-400 italic">базе</span>
            </h1>
            <p className="text-slate-400 text-lg md:text-xl font-medium mb-12 max-w-2xl mx-auto leading-relaxed opacity-80">
              Умный поиск по базе ТН ВЭД. Нажмите на карточку, чтобы увидеть подробности.
            </p>
            <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full">
              <form onSubmit={handleSearchClick} className="relative flex items-center bg-[#1e293b]/40 border border-slate-700/50 rounded-full p-2 pl-8 focus-within:border-yellow-400/50 transition-all shadow-inner backdrop-blur-sm">
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Введите название товара..."
                  className="flex-grow bg-transparent border-none py-4 text-white text-lg placeholder:text-slate-500 focus:outline-none"
                />
                <button type="submit" disabled={isSearching} className="bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-black px-12 py-4 rounded-full transition-all active:scale-95 disabled:opacity-70 text-lg shadow-lg">
                  {isSearching ? "Поиск..." : "Найти"}
                </button>
              </form>
              {showNoResultsHint && (
                <div className="mt-4 animate-in slide-in-from-top-4 duration-300">
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-3xl p-6 flex items-start gap-4 text-left backdrop-blur-sm">
                    <div className="bg-orange-500 p-2 rounded-xl text-white shrink-0">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    </div>
                    <div>
                      <h4 className="font-black text-orange-500 text-sm uppercase tracking-wider mb-1">Ничего не найдено</h4>
                      <p className="text-slate-300 text-sm leading-relaxed">
                        Попробуйте поискать по более общей категории, например: <span className="text-white font-bold underline cursor-pointer hover:text-yellow-400 transition-colors" onClick={() => {setSearchQuery('одежда'); triggerSearch('одежда');}}>одежда</span>, <span className="text-white font-bold underline cursor-pointer hover:text-yellow-400 transition-colors" onClick={() => {setSearchQuery('электроника'); triggerSearch('электроника');}}>электроника</span> или <span className="text-white font-bold underline cursor-pointer hover:text-yellow-400 transition-colors" onClick={() => {setSearchQuery('инструмент'); triggerSearch('инструмент');}}>инструмент</span>.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div id="search-results-anchor" className="scroll-mt-10"></div>

      {(isSearching || searchResults.length > 0) && (
        <div className="max-w-7xl mx-auto px-4 mt-20">
          <div className="flex items-center gap-4 mb-10">
            <div className="w-2 h-10 rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]"></div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">
              {searchResults.length > 0 ? 'Подходящие позиции' : 'Ничего не найдено'}
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-start">
            {isSearching ? (
              [1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-[320px] bg-white rounded-[3rem] border border-slate-100 animate-pulse p-8 shadow-sm"></div>)
            ) : (
              searchResults.map((item, idx) => (
                <div key={`${item.code}-${idx}`} className={`group relative p-8 rounded-[3.5rem] border-2 transition-all hover:shadow-2xl flex flex-col h-full cursor-pointer ${selectedCode?.code === item.code ? 'border-emerald-400 bg-emerald-50/30' : 'border-white bg-white hover:border-slate-100'}`} onClick={() => setViewingProduct(item)}>
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-6">
                      <span className="text-[10px] font-black uppercase text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full">{item.category}</span>
                      <div className="font-mono text-sm text-emerald-600 font-black bg-emerald-500/10 px-3 py-1.5 rounded-xl tracking-tighter">{item.code}</div>
                    </div>
                    <h3 className="font-black text-slate-900 text-xl mb-3 leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors">{item.name}</h3>
                    <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed line-clamp-3">{item.description}</p>
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
                    <div className="flex gap-2">
                      <button onClick={(e) => { e.stopPropagation(); selectProduct(item); }} className="flex-grow py-5 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-2xl transition-all active:scale-95 text-[10px] uppercase tracking-widest shadow-lg">В расчет</button>
                      <button onClick={(e) => { e.stopPropagation(); setViewingProduct(item); }} className="p-5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl transition-all active:scale-90">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div id="calculator-section" className="max-w-7xl mx-auto px-4 mt-20 scroll-mt-24">
        {selectedCode && (
          <div className="mb-10 flex justify-end">
            <button onClick={scrollToSearch} className="bg-white border border-slate-200 text-slate-900 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all flex items-center gap-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m11 17-5-5 5-5"/><path d="M18 17l-5-5 5-5"/></svg>
              Вернуться к поиску
            </button>
          </div>
        )}
        <Calculator 
          rates={rates}
          ratesUI={ratesUI}
          onRateChange={handleRateChange}
          selectedCode={selectedCode} 
          onCodeChange={(code) => {
            const found = TNVED_DB.find(l => l.code === code);
            if (found) setSelectedCode(found);
            setTimeout(() => { document.getElementById('calculator-section')?.scrollIntoView({ behavior: 'smooth' }); }, 100);
          }}
        />
      </div>
    </div>
  );
};

export default App;
