import React, { useState, useEffect, useMemo } from 'react';
import { TNVEDCode, ExchangeRates } from './types';
import { Calculator } from './components/Calculator';
import { TNVED_DB } from './data/tnved_db';
import { CATEGORY_MAP, SYNONYMS } from './data/search_maps';

// Популярные коды для быстрого старта (например, телефоны, ноутбуки)
const POPULAR_LIBRARY: TNVEDCode[] = TNVED_DB.slice(0, 4);

// Стоп-слова (предлоги и мусор), которые мы игнорируем при поиске
const STOP_WORDS = new Set([
  'для', 'из', 'под', 'над', 'без', 'при', 'все', 'эти', 'этот', 'какой', 'такой', 
  'сверху', 'снизу', 'внутри', 'комплект', 'набор', 'шт', 'кг', 'с', 'и', 'в', 'на', 
  'прочие', 'кроме', 'том', 'числе'
]);

const App: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCode, setSelectedCode] = useState<TNVEDCode | null>(POPULAR_LIBRARY[0]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<TNVEDCode[]>([]);
  const [viewingProduct, setViewingProduct] = useState<TNVEDCode | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [showScrollToSearch, setShowScrollToSearch] = useState(false);
  
  // Курсы валют (можно подключить API ЦБ РФ, пока хардкод для примера)
  const [ratesUI, setRatesUI] = useState({
    USD: '91.8',
    EUR: '99.5',
    CNY: '12.6'
  });

  const rates: ExchangeRates = useMemo(() => ({
    USD: parseFloat(ratesUI.USD) || 0,
    EUR: parseFloat(ratesUI.EUR) || 0,
    CNY: parseFloat(ratesUI.CNY) || 0,
  }), [ratesUI]);

  // --- ГЛАВНАЯ ЛОГИКА ПОИСКА ---
  useEffect(() => {
    // 1. Если запрос пустой, очищаем результаты
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    // 2. Подготовка запроса
    // Приводим к нижнему регистру и разбиваем на слова, убирая стоп-слова
    const rawQuery = searchQuery.toLowerCase().trim();
    const queryTokens = rawQuery
      .split(/[\s,.-]+/) // разбиваем по пробелам, запятым, точкам
      .filter(token => token.length > 1 && !STOP_WORDS.has(token));

    // Если остались только стоп-слова или пустота, не ищем
    if (queryTokens.length === 0 && rawQuery.length < 3) {
      setIsSearching(false);
      return;
    }

    // 3. Таймер для оптимизации (debounce), чтобы не тормозило при вводе
    const timeoutId = setTimeout(() => {
      const results = TNVED_DB.filter(item => {
        const itemCode = item.code;
        const itemName = item.name.toLowerCase();
        const itemDesc = item.description.toLowerCase();
        
        // Получаем ключ группы (первые 4 цифры) для поиска синонимов
        const groupKey = itemCode.substring(0, 4);
        const itemSynonyms = SYNONYMS[groupKey] || [];

        // Проверяем каждое слово из запроса
        // Режим "AND": товар должен соответствовать хотя бы одному значимому слову или полному коду
        return queryTokens.some(token => {
          // А. Точное совпадение кода (или начало кода)
          if (itemCode.startsWith(rawQuery)) return true;

          // Б. Поиск в названии
          if (itemName.includes(token)) return true;

          // В. Поиск в синонимах
          if (itemSynonyms.some(s => s.toLowerCase().includes(token))) return true;

          // Г. Поиск в описании (самый низкий приоритет)
          if (itemDesc.includes(token)) return true;

          return false;
        });
      });

      // 4. СОРТИРОВКА (Самая важная часть для релевантности)
      results.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aDesc = a.description.toLowerCase();
        const bDesc = b.description.toLowerCase();

        // Фактор 1: Точное совпадение названия с запросом (Абсолютный лидер)
        if (aName === rawQuery && bName !== rawQuery) return -1;
        if (bName === rawQuery && aName !== rawQuery) return 1;

        // Фактор 2: Запрос содержится в НАЗВАНИИ (Выше, чем в описании)
        const aNameHas = queryTokens.some(t => aName.includes(t));
        const bNameHas = queryTokens.some(t => bName.includes(t));
        
        if (aNameHas && !bNameHas) return -1; // A лучше
        if (!aNameHas && bNameHas) return 1;  // B лучше

        // Фактор 3: Короткие коды/названия обычно более общие и важные
        // (Например "Насос" лучше, чем "Части насосов")
        if (aNameHas && bNameHas) {
            return a.name.length - b.name.length;
        }

        // Фактор 4: Совпадение в СИНОНИМАХ (Если не в названии)
        const aGroup = a.code.substring(0, 4);
        const bGroup = b.code.substring(0, 4);
        const aSyns = SYNONYMS[aGroup] || [];
        const bSyns = SYNONYMS[bGroup] || [];
        
        const aSynHas = queryTokens.some(t => aSyns.some(s => s.toLowerCase().includes(t)));
        const bSynHas = queryTokens.some(t => bSyns.some(s => s.toLowerCase().includes(t)));

        if (aSynHas && !bSynHas) return -1;
        if (!aSynHas && bSynHas) return 1;

        // Остальное (описание) уже отсортировано как "менее важное"
        return 0;
      });

      // Ограничиваем выдачу 50 результатами для скорости
      setSearchResults(results.slice(0, 50));
      setIsSearching(false);
    }, 300); // 300мс задержка

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // --- UI handlers ---
  const handleRateChange = (currency: keyof typeof ratesUI, value: string) => {
    setRatesUI(prev => ({ ...prev, [currency]: value }));
  };

  const handleSelectCode = (code: TNVEDCode) => {
    setSelectedCode(code);
    setViewingProduct(null); // Закрыть модалку/детали списка если есть
    
    // Плавный скролл к калькулятору
    setTimeout(() => {
      document.getElementById('calculator-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const scrollToSearch = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Следим за скроллом для кнопки "Вернуться"
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollToSearch(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      
      {/* HEADER & SEARCH */}
      <div className="bg-slate-900 text-white pt-16 pb-24 px-4 rounded-b-[2.5rem] shadow-2xl relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-10 pointer-events-none">
             <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-500 rounded-full blur-3xl"></div>
             <div className="absolute top-1/2 -left-24 w-72 h-72 bg-purple-500 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-4xl mx-auto relative z-10 text-center">
          <h1 className="text-4xl md:text-6xl font-black mb-6 tracking-tight leading-tight">
            Таможенный <span className="text-blue-400">Калькулятор</span>
          </h1>
          <p className="text-slate-400 text-lg mb-10 max-w-2xl mx-auto">
            Мгновенный расчет пошлин и налогов по кодам ТН ВЭД. Введите название товара или код.
          </p>
          
          <div className="relative max-w-2xl mx-auto group">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-200"></div>
            <div className="relative flex items-center bg-white rounded-xl shadow-xl overflow-hidden p-2">
              <span className="pl-4 text-slate-400">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </span>
              <input 
                type="text"
                placeholder="Например: Смартфон, 8517, Кроссовки..."
                className="w-full py-4 px-4 text-lg text-slate-900 placeholder-slate-400 outline-none font-medium"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="p-2 text-slate-300 hover:text-slate-500 transition-colors"
                >
                   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SEARCH RESULTS */}
      {(hasSearched || isSearching) && (
        <div className="max-w-4xl mx-auto px-4 -mt-10 relative z-20 mb-12">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden min-h-[100px]">
            
            {isSearching ? (
              <div className="p-8 text-center text-slate-400">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                <p>Поиск по базе...</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-slate-900 font-bold text-lg mb-2">Ничего не найдено</p>
                <p className="text-slate-500">Попробуйте изменить запрос или использовать синонимы</p>
              </div>
            ) : (
              searchResults.map((item) => (
                <div 
                  key={item.code} 
                  onClick={() => handleSelectCode(item)}
                  className="group p-6 border-b border-slate-100 last:border-0 hover:bg-blue-50/50 cursor-pointer transition-colors flex flex-col md:flex-row gap-4 items-start md:items-center justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-mono text-sm font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded">
                        {item.code}
                      </span>
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        {CATEGORY_MAP[item.code.substring(0, 2)] || item.category || 'Товар'}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-700 transition-colors mb-1">
                      {item.name}
                    </h3>
                    <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-4 w-full md:w-auto mt-2 md:mt-0">
                    <div className="flex flex-col items-end min-w-[80px]">
                      <span className="text-xs text-slate-400 font-medium">Пошлина</span>
                      <span className={`font-bold ${item.importDuty === 0 ? 'text-green-600' : 'text-slate-700'}`}>
                        {item.importDuty}%
                      </span>
                    </div>
                    <div className="flex flex-col items-end min-w-[60px]">
                       <span className="text-xs text-slate-400 font-medium">НДС</span>
                       <span className="font-bold text-slate-700">{item.vat}%</span>
                    </div>
                    <div className="hidden md:block pl-4 text-slate-300 group-hover:text-blue-400 group-hover:translate-x-1 transition-all">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* CALCULATOR SECTION */}
      <div id="calculator-section" className="max-w-7xl mx-auto px-4 mt-8 scroll-mt-24">
        {selectedCode && (
          <div className="mb-8 flex justify-end">
            {/* Кнопка возврата видна только если мы прокрутили вниз */}
            {showScrollToSearch && (
              <button 
                onClick={scrollToSearch} 
                className="fixed bottom-8 right-8 z-50 bg-slate-900 text-white px-5 py-3 rounded-full font-bold text-sm shadow-2xl hover:bg-blue-600 transition-all flex items-center gap-2 animate-fade-in-up"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6"/></svg>
                Поиск
              </button>
            )}
          </div>
        )}
        
        <Calculator 
          rates={rates}
          ratesUI={ratesUI}
          onRateChange={handleRateChange}
          selectedCode={selectedCode}
        />
      </div>
      
      {/* FOOTER */}
      <footer className="max-w-7xl mx-auto px-4 mt-20 text-center text-slate-400 text-sm pb-10">
        <p>© 2024 TNVED Calc. Данные носят справочный характер.</p>
      </footer>
    </div>
  );
};

export default App;
