
import React, { useState } from 'react';
import { TNVEDCode, ExchangeRates } from './types';
import { Calculator } from './components/Calculator';
import { TNVED_DB } from './data/tnved_db';

const POPULAR_LIBRARY: TNVEDCode[] = TNVED_DB.slice(0, 4);

/**
 * Глобальный словарь ассоциаций для ТН ВЭД.
 * Помогает найти категорию по частному названию товара.
 */
const SEARCH_ASSET_MAP: Record<string, string[]> = {
  'ноут': ['ноутбук', 'компьютер', 'лэптоп', 'вычислительная'],
  'комп': ['ноутбук', 'монитор', 'пк', 'системный', 'вычислительная'],
  'смартфон': ['телефон', 'аппарат', 'сотовый', 'мобильный', 'iphone', 'айфон'],
  'телефон': ['смартфон', 'мобильный', 'айфон'],
  'одежд': ['платье', 'брюки', 'куртка', 'футболка', 'шорты', 'носки', 'текстиль'],
  'брюк': ['одежда', 'штаны', 'джинсы'],
  'обув': ['кроссовки', 'ботинки', 'кеды', 'сапоги', 'туфли', 'балетки'],
  'кроссовк': ['обувь', 'кеды', 'кросы', 'спортивная'],
  'кеды': ['обувь', 'кроссовки'],
  'запчаст': ['авто', 'детали', 'компоненты', 'бампер', 'радиатор', 'фара', 'фильтр'],
  'авто': ['машина', 'транспорт', 'запчасти'],
  'еда': ['продукты', 'питание', 'бакалея'],
  'косметик': ['крем', 'шампунь', 'мыло', 'химия', 'уход'],
  'игрушк': ['детское', 'кукла', 'конструктор', 'пазл'],
};

const App: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCode, setSelectedCode] = useState<TNVEDCode | null>(POPULAR_LIBRARY[0]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<TNVEDCode[]>([]);
  
  const [ratesUI, setRatesUI] = useState({
    USD: '91.8',
    CNY: '12.7',
    EUR: '98.5'
  });

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

  /**
   * Улучшенный стеммер: более агрессивно чистит окончания для точности сопоставления.
   */
  const getStem = (word: string): string => {
    return word
      .toLowerCase()
      .trim()
      .replace(/[.,!?;:]/g, '')
      .replace(/(иями|ями|иям|ям|иях|ях|ов|ев|ий|ый|ая|ое|ые|ие|ия|ой|ей|ам|ом|а|и|ы|е|у|ю|ь|я|с)$/g, '');
  };

  const handleSearchLocal = (query: string) => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length < 2) return [];

    // 1. Извлекаем чистые смысловые токены из запроса
    const queryWords = trimmed.split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length === 0) return [];

    const queryStems = queryWords.map(w => getStem(w));
    
    // 2. Расширяем токены через карту ассоциаций (только если есть совпадения)
    const expandedSearchTerms = new Set<string>(queryStems);
    queryStems.forEach(qs => {
      Object.entries(SEARCH_ASSET_MAP).forEach(([key, values]) => {
        const keyStem = getStem(key);
        if (qs.includes(keyStem) || keyStem.includes(qs)) {
          values.forEach(v => expandedSearchTerms.add(getStem(v)));
        }
      });
    });

    // 3. Проходим по базе данных с умным весовым ранжированием
    const scoredResults = TNVED_DB.map(item => {
      let score = 0;
      let matchesCount = 0;

      const itemName = item.name.toLowerCase();
      const itemCat = item.category.toLowerCase();
      const itemDesc = item.description.toLowerCase();

      // Анализируем каждый токен поиска
      expandedSearchTerms.forEach(term => {
        let termFound = false;

        // Приоритет 1: Название товара (огромный вес)
        if (getStem(itemName).includes(term)) {
          score += 15;
          termFound = true;
        }
        
        // Приоритет 2: Категория
        if (getStem(itemCat).includes(term)) {
          score += 8;
          termFound = true;
        }

        // Приоритет 3: Описание (вспомогательный вес)
        if (getStem(itemDesc).includes(term)) {
          score += 2;
          termFound = true;
        }

        if (termFound) matchesCount++;
      });

      // БОНУС: Если в товаре найдены ВСЕ слова из оригинального запроса
      const allOriginalWordsFound = queryStems.every(qs => 
        getStem(itemName).includes(qs) || getStem(itemCat).includes(qs) || getStem(itemDesc).includes(qs)
      );
      
      if (allOriginalWordsFound && queryStems.length > 1) {
        score += 50; 
      }

      // Порог релевантности: если не найдено ни одно из слов запроса напрямую (или через синоним), 
      // либо вес слишком мал для большого количества слов — отсеиваем.
      const relevanceThreshold = queryStems.length > 1 ? 10 : 5;

      return { item, score, relevance: score >= relevanceThreshold };
    });

    return scoredResults
      .filter(res => res.relevance && res.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(res => res.item)
      .slice(0, 24);
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
    }, 250);
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
          {/* Декоративные элементы фона */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
             <div className="absolute -top-24 -left-24 w-96 h-96 bg-yellow-400 rounded-full blur-[120px]"></div>
             <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-blue-500 rounded-full blur-[120px]"></div>
          </div>

          <div className="relative z-10 max-w-4xl mx-auto text-center w-full">
            <div className="inline-flex items-center justify-center border border-yellow-400/20 bg-yellow-400/5 px-6 py-2 rounded-full mb-12">
               <span className="text-[10px] font-black text-yellow-400 uppercase tracking-[0.2em]">
                 ИНТЕЛЛЕКТУАЛЬНЫЙ ПОИСК ТН ВЭД
               </span>
            </div>
            <h1 className="text-4xl md:text-7xl font-black mb-6 leading-tight tracking-tight">
              Найдите код в <span className="text-yellow-400 italic">базе</span>
            </h1>
            <p className="text-slate-400 text-lg md:text-xl font-medium mb-12 max-w-2xl mx-auto leading-relaxed opacity-80">
              Высокоточный поиск по 100 000+ позиций. Понимает смыслы, склонения и категории.
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
                <button 
                  type="submit"
                  disabled={isSearching}
                  className="bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-black px-12 py-4 rounded-full transition-all active:scale-95 disabled:opacity-70 text-lg shadow-lg"
                >
                  {isSearching ? "Поиск..." : "Найти"}
                </button>
              </form>
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
              {searchResults.length > 0 ? 'Наиболее подходящие коды' : 'Ничего не найдено'}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-start">
            {isSearching ? (
              [1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-[280px] bg-white rounded-[3rem] border border-slate-100 animate-pulse p-8 shadow-sm"></div>
              ))
            ) : (
              searchResults.map((item, idx) => (
                <div key={`${item.code}-${idx}`} className={`group relative p-8 rounded-[3.5rem] border-2 transition-all hover:shadow-2xl flex flex-col h-full ${selectedCode?.code === item.code ? 'border-emerald-400 bg-emerald-50/30' : 'border-white bg-white hover:border-slate-100'}`}>
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-6">
                      <span className="text-[10px] font-black uppercase text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full">{item.category}</span>
                      <div className="font-mono text-sm text-emerald-600 font-black bg-emerald-500/10 px-3 py-1.5 rounded-xl tracking-tighter">{item.code}</div>
                    </div>
                    <h3 className="font-black text-slate-900 text-xl mb-3 leading-snug">{item.name}</h3>
                    <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed line-clamp-2">{item.description}</p>
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
                    <button onClick={() => selectProduct(item)} className="w-full py-5 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-2xl transition-all active:scale-95 text-xs uppercase tracking-widest shadow-lg shadow-slate-200">
                      Добавить в расчет
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div id="calculator-section" className="max-w-7xl mx-auto px-4 mt-20 scroll-mt-10">
        <Calculator 
          rates={rates}
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
