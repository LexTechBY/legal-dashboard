import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  FileText, Upload, Download, 
  Info, Loader2, Scale, Sparkles, CheckCircle2,
  Users, ChevronLeft, ChevronRight, TableProperties,
  Wrench, PenTool, Trash2, Settings, Undo2,
  Target, ArrowRight, AlertCircle
} from 'lucide-react';
import mammoth from 'mammoth';
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx'; 
import JSZip from 'jszip';    

export default function App() {
  // === СУЩЕСТВУЮЩИЙ СТЕЙТ (DRAFTING MODE) ===
  const[htmlContent, setHtmlContent] = useState('');
  const [originalBuffer, setOriginalBuffer] = useState(null); 
  const [formData, setFormData] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeField, setActiveField] = useState(null);
  const fileInputRef = useRef(null);

  const [appMode, setAppMode] = useState('single'); 
  const [batchData, setBatchData] = useState([]); 
  const[batchPreviewIndex, setBatchPreviewIndex] = useState(0);
  const batchFileInputRef = useRef(null);

  // === СТЕЙТ DRAFTING (Подтверждение экспорта) ===
  const[exportConfirm, setExportConfirm] = useState(false);

  // === СУЩЕСТВУЮЩИЙ СТЕЙТ (BUILDER MODE) ===
  const [isBuilderMode, setIsBuilderMode] = useState(false);
  const [replacements, setReplacements] = useState([]);
  const[selectionRect, setSelectionRect] = useState(null);
  const [selectedText, setSelectedText] = useState('');
  const[newTagData, setNewTagData] = useState({ name: '', comment: '', replaceAll: true });

  // === ОБЩАЯ ЛОГИКА ===
  const resetTemplate = () => {
    setHtmlContent('');
    setOriginalBuffer(null);
    setFormData({});
    setActiveField(null);
    setBatchData([]);
    setBatchPreviewIndex(0);
    setAppMode('single');
    setIsBuilderMode(false);
    setReplacements([]);
    setExportConfirm(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      setOriginalBuffer(arrayBuffer); 
      const result = await mammoth.convertToHtml({ arrayBuffer });
      setHtmlContent(result.value || '');
      setFormData({}); 
      setReplacements([]);
      setExportConfirm(false);
    } catch (err) {
      console.error(err);
      alert("Ошибка парсинга документа. Проверьте формат DOCX.");
    } finally {
      setIsProcessing(false);
    }
  };

  // === ЛОГИКА DRAFTING (ЗАПОЛНЕНИЕ) ===
  const placeholders = useMemo(() => {
    if (!htmlContent) return[];
    const regex = /\{([^{}|]+)(?:\|([^}]+))?\}/g;
    const matches =[];
    const seen = new Set();
    let match;
    while ((match = regex.exec(htmlContent)) !== null) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        matches.push({ full: match[0], key: match[1], comment: match[2] || "" });
      }
    }
    return matches;
  }, [htmlContent]);

  // ИЗМЕНЕНИЕ 1: Сброс подтверждения экспорта при любом изменении данных
  useEffect(() => { setExportConfirm(false); }, [formData, batchData, batchPreviewIndex]);

  const handleBulkPaste = (e, startIndex) => {
    const pasteData = e.clipboardData.getData('text');
    const lines = pasteData.split(/\r?\n/).map(line => line.trim()).filter(line => line !== "");
    if (lines.length > 1) {
      e.preventDefault(); 
      const newFormData = { ...formData };
      lines.forEach((line, index) => {
        const targetPlaceholder = placeholders[startIndex + index];
        if (targetPlaceholder) { newFormData[targetPlaceholder.key] = line; }
      });
      setFormData(newFormData);
    }
  };

  const exportOriginalWithData = async () => {
    if (!originalBuffer) return;
    setIsProcessing(true);
    try {
      const zip = new PizZip(originalBuffer);
      const xmlFiles = Object.keys(zip.files).filter(name => name.match(/^word\/(document|header|footer|footnotes|endnotes)\d*\.xml$/));
      xmlFiles.forEach((fileName) => {
        let content = zip.files[fileName].asText();
        content = content.replace(/<w:proofErr[^>]*\/>/g, '').replace(/<w:noProof[^>]*\/>/g, '').replace(/<w:lang [^>]*\/>/g, '');
        const sorted =[...placeholders].sort((a, b) => b.full.length - a.full.length);
        sorted.forEach(({ full, key }) => {
          const fuzzyPattern = full.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(?:<[^>]+>)*');
          const regex = new RegExp(fuzzyPattern, 'g');
          if (regex.test(content)) {
            const val = (formData[key] || full).toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            content = content.replace(regex, val);
          }
        });
        zip.file(fileName, content);
      });
      const out = zip.generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      saveAs(out, `Document_Export_${Date.now()}.docx`);
    } catch (err) { 
      alert("Ошибка сборки"); 
    } finally { 
      setIsProcessing(false); 
      setExportConfirm(false);
    }
  };

  const currentFormData = appMode === 'single' ? formData : (batchData[batchPreviewIndex] || {});

  const downloadExcelTemplate = () => {
    if (placeholders.length === 0) return;
    const headers = placeholders.map(p => p.key);
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Lumina_Batch_Template.xlsx");
  };

  const handleBatchImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsProcessing(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      setBatchData(jsonData);
      setBatchPreviewIndex(0);
    } catch (err) { 
      alert("Ошибка чтения Excel"); 
    } finally { 
      setIsProcessing(false); 
      if (batchFileInputRef.current) batchFileInputRef.current.value = ''; 
    }
  };

  const handleBatchDataChange = (key, value) => {
    setBatchData(prev => {
      const newData = [...prev];
      newData[batchPreviewIndex] = { ...newData[batchPreviewIndex], [key]: value };
      return newData;
    });
  };

  const exportBatchDocs = async () => {
    if (!originalBuffer || batchData.length === 0) return;
    setIsProcessing(true);
    try {
      const finalZip = new JSZip(); 
      for (let i = 0; i < batchData.length; i++) {
        const rowData = batchData[i];
        const docxZip = new PizZip(originalBuffer);
        const xmlFiles = Object.keys(docxZip.files).filter(name => name.match(/^word\/(document|header|footer|footnotes|endnotes)\d*\.xml$/));
        xmlFiles.forEach((fileName) => {
          let content = docxZip.files[fileName].asText();
          content = content.replace(/<w:proofErr[^>]*\/>/g, '').replace(/<w:noProof[^>]*\/>/g, '').replace(/<w:lang[^>]*\/>/g, '');
          const sorted =[...placeholders].sort((a, b) => b.full.length - a.full.length);
          sorted.forEach(({ full, key }) => {
            const fuzzyPattern = full.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(?:<[^>]+>)*');
            const regex = new RegExp(fuzzyPattern, 'g');
            if (regex.test(content)) {
              const val = (rowData[key] || full).toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              content = content.replace(regex, val);
            }
          });
          docxZip.file(fileName, content);
        });
        const docxBlob = docxZip.generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        const firstKey = placeholders[0]?.key;
        const identifier = firstKey && rowData[firstKey] ? String(rowData[firstKey]).substring(0, 20).replace(/[^a-zA-Z0-9а-яА-Я]/g, '_') : `Doc_${i+1}`;
        finalZip.file(`Document_${identifier}_${i+1}.docx`, docxBlob);
      }
      const finalArchive = await finalZip.generateAsync({ type: "blob" });
      saveAs(finalArchive, `Lumina_Batch_${batchData.length}_Docs_${Date.now()}.zip`);
    } catch (err) { 
      alert("Ошибка генерации"); 
    } finally { 
      setIsProcessing(false);
      setExportConfirm(false); // Сброс стейта экспорта после создания архива
    }
  };

  // === НОВАЯ ЛОГИКА BUILDER (РАЗМЕТКА ШАБЛОНА) ===

  const handleDocumentMouseUp = () => {
    if (!isBuilderMode) return;
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    if (text.length > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectedText(text);
      setSelectionRect({
        top: rect.top,
        left: rect.left + rect.width / 2,
      });
      setNewTagData({ name: '', comment: '', replaceAll: true });
    } else {
      setSelectionRect(null);
    }
  };

  const addReplacement = () => {
    if (!newTagData.name) return;
    setReplacements(prev =>[...prev, {
      id: Date.now(),
      originalText: selectedText,
      tag: newTagData.name.replace(/[^a-zA-Zа-яА-ЯёЁ0-9_]/g, ''), 
      comment: newTagData.comment,
      replaceAll: newTagData.replaceAll
    }]);
    setSelectionRect(null);
    window.getSelection().removeAllRanges();
  };

  const undoLastReplacement = () => {
    setReplacements(prev => prev.slice(0, -1));
  };

  const exportTemplate = async () => {
    if (!originalBuffer || replacements.length === 0) return;
    setIsProcessing(true);
    try {
      const zip = new PizZip(originalBuffer);
      const xmlFiles = Object.keys(zip.files).filter(name => 
        name.match(/^word\/(document|header|footer|footnotes|endnotes)\d*\.xml$/)
      );

      xmlFiles.forEach((fileName) => {
        let content = zip.files[fileName].asText();
        content = content.replace(/<w:proofErr [^>]*\/>/g, '').replace(/<w:noProof[^>]*\/>/g, '').replace(/<w:lang [^>]*\/>/g, '');
        
        const sorted = [...replacements].sort((a, b) => b.originalText.length - a.originalText.length);
        
        sorted.forEach((r) => {
          const fuzzyPattern = r.originalText.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(?:<[^>]+>)*');
          const regex = new RegExp(fuzzyPattern, r.replaceAll ? 'g' : '');
          
          const replacementString = r.comment ? `{${r.tag}|${r.comment}}` : `{${r.tag}}`;
          
          if (regex.test(content)) {
            content = content.replace(regex, replacementString);
          }
        });
        zip.file(fileName, content);
      });

      const out = zip.generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      saveAs(out, `Lumina_SmartTemplate_${Date.now()}.docx`);
    } catch (err) {
      console.error(err);
      alert("Ошибка создания шаблона.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Smart Autocomplete (поиск существующих тегов)
  const existingTags = Array.from(new Set(replacements.map(r => r.tag)));
  const matchingTags = newTagData.name 
    ? existingTags.filter(t => t.toLowerCase().includes(newTagData.name.toLowerCase()) && t !== newTagData.name) 
    :[];

  // Группировка меток для сайдбара
  const groupedReplacements = useMemo(() => {
    const map = new Map();
    replacements.forEach(r => {
      if (!map.has(r.tag)) {
        map.set(r.tag, { tag: r.tag, originalTexts: new Set(), comments: new Set(), ids:[] });
      }
      const group = map.get(r.tag);
      group.originalTexts.add(r.originalText);
      if (r.comment) group.comments.add(r.comment);
      group.ids.push(r.id);
    });
    return Array.from(map.values()).map(g => ({
      ...g,
      originalTexts: Array.from(g.originalTexts),
      comments: Array.from(g.comments)
    }));
  }, [replacements]);

  // ИЗМЕНЕНИЕ 2: Прогресс-бар для Drafting (универсальный для Single и Batch)
  const totalFields = placeholders.length;
  const filledFields = placeholders.filter(p => currentFormData[p.key]).length;
  const progressPercent = totalFields === 0 ? 0 : Math.round((filledFields / totalFields) * 100);
  const isComplete = totalFields > 0 && filledFields === totalFields;

  // Макро-проверка для всего массива
  const isBatchComplete = batchData.length > 0 && batchData.every(row => placeholders.every(p => row[p.key]));

  const focusNextEmpty = () => {
    const nextEmpty = placeholders.find(p => !currentFormData[p.key]);
    if (nextEmpty) {
       setActiveField(nextEmpty.key);
       document.getElementById(`target-${nextEmpty.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
       document.getElementById(`input-${nextEmpty.key}`)?.focus();
    }
  };

  // === ПРЕВЬЮ (ДИНАМИЧЕСКИЙ РЕНДЕР) ===
  const processedHtmlPreview = useMemo(() => {
    if (!htmlContent) return "";
    let finalHtml = htmlContent;
    
    if (isBuilderMode) {
      replacements.forEach(r => {
         const badge = `<span id="builder-tag-${r.id}" class="builder-tag">[${r.tag}]</span>`;
         if (r.replaceAll) {
           finalHtml = finalHtml.split(r.originalText).join(badge);
         } else {
           finalHtml = finalHtml.replace(r.originalText, badge);
         }
      });
      return finalHtml;
    }

    const escapeHtml = (unsafe) => String(unsafe || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");
    placeholders.forEach(({ full, key }) => {
      const value = currentFormData[key];
      const filledStyle = `mx-0.5 px-2 py-0.5 bg-indigo-50/80 text-indigo-900 font-semibold rounded-md shadow-[0_1px_3px_rgba(79,70,229,0.1)] border-b border-indigo-300 transition-all`;
      const emptyStyle = `mx-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-300/60 border-dashed rounded-md font-medium transition-all shadow-[0_0_10px_rgba(251,191,36,0.15)]`;
      
      const safeValue = escapeHtml(value);
      const replacement = `<span id="target-${key}" class="${value ? filledStyle : emptyStyle}">${safeValue || full}</span>`;
      finalHtml = finalHtml.split(full).join(replacement);
    });
    return finalHtml; 
  },[htmlContent, placeholders, currentFormData, isBuilderMode, replacements]);

  return (
    <div className="h-screen w-screen bg-[#F8FAFC] flex overflow-hidden font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-900 relative">
      
      {/* ПОВЕРХНОСТНЫЙ ТУЛБАР (FLOATING BUILDER TOOLBAR) */}
      {selectionRect && isBuilderMode && (
        <div 
          className="fixed z-50 flex flex-col gap-2 p-3 bg-white/95 backdrop-blur-xl border border-purple-200 rounded-2xl shadow-[0_20px_40px_rgba(168,85,247,0.2)] animate-in zoom-in-95 duration-200"
          style={{ top: selectionRect.top - 15, left: selectionRect.left, transform: 'translate(-50%, -100%)' }}
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-[10px] font-bold truncate max-w-[200px]">
              "{selectedText}"
            </div>
          </div>
          <div className="relative">
            <input 
              autoFocus
              placeholder="Имя метки" 
              className="w-64 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 font-medium relative z-10"
              value={newTagData.name}
              onChange={e => setNewTagData({...newTagData, name: e.target.value.replace(/[^a-zA-Zа-яА-ЯёЁ0-9_]/g, '')})} 
            />
            {matchingTags.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-full bg-white border border-purple-100 rounded-lg shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                {matchingTags.map(tag => (
                  <div 
                    key={tag} 
                    onClick={() => setNewTagData({...newTagData, name: tag})} 
                    className="px-3 py-2.5 text-xs text-purple-700 hover:bg-purple-50 cursor-pointer font-bold border-b border-purple-50 last:border-0 flex items-center justify-between group"
                  >
                    <span>{tag}</span>
                    <Target size={12} className="opacity-0 group-hover:opacity-100 text-purple-400 transition-opacity" />
                  </div>
                ))}
              </div>
            )}
          </div>
          <input 
            placeholder="Подсказка (опционально)" 
            className="w-64 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
            value={newTagData.comment}
            onChange={e => setNewTagData({...newTagData, comment: e.target.value})}
          />
          <div className="flex items-center justify-between mt-1">
            <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 cursor-pointer uppercase tracking-wider">
              <input type="checkbox" checked={newTagData.replaceAll} onChange={e => setNewTagData({...newTagData, replaceAll: e.target.checked})} className="accent-purple-600 w-3 h-3" />
              Заменить везде
            </label>
            <button 
              onClick={addReplacement} disabled={!newTagData.name}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 shadow-md shadow-purple-500/30 disabled:shadow-none relative z-10"
            >
              Создать
            </button>
          </div>
        </div>
      )}

      {/* САЙДБАР */}
      <aside className="w-[420px] bg-white/60 backdrop-blur-2xl border-r border-slate-200/60 flex flex-col shadow-[10px_0_40px_rgba(0,0,0,0.03)] z-20">
        
        {/* Брендинг и Импорт Шаблона */}
        <div className="p-7 bg-white/40 border-b border-slate-100 relative overflow-hidden flex flex-col items-center shrink-0">
          <div className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl pointer-events-none transition-colors duration-1000 ${isBuilderMode ? 'bg-gradient-to-br from-purple-500/20 to-pink-500/5' : 'bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent'}`}></div>
          
          <div className="w-full flex items-center justify-between mb-6 relative z-10">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-colors duration-500 ${isBuilderMode ? 'bg-gradient-to-tr from-purple-600 to-pink-500 shadow-purple-500/30' : 'bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-indigo-500/20'}`}>
                {isBuilderMode ? <Wrench size={18} className="text-white" /> : <Sparkles size={18} className="text-white" />}
              </div>
              <div>
                <h2 className="text-xl font-medium tracking-tight text-slate-900">
                  Lumina <span className={`font-bold bg-clip-text text-transparent bg-gradient-to-r ${isBuilderMode ? 'from-purple-600 to-pink-500' : 'from-indigo-600 to-violet-500'}`}>{isBuilderMode ? 'Builder' : 'Legal'}</span>
                </h2>
                <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-[0.2em] mt-0.5">{isBuilderMode ? 'Template Creation' : 'Automated Drafting'}</p>
              </div>
            </div>
            {originalBuffer && (
              <button onClick={resetTemplate} className="p-2 hover:bg-slate-100 text-slate-400 hover:text-red-500 rounded-lg transition-colors" title="Сбросить документ">
                <FileText size={16} />
              </button>
            )}
          </div>

          <button 
            onClick={() => fileInputRef.current.click()} 
            className={`relative z-10 w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 py-3 rounded-xl font-semibold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md active:scale-[0.98]`}
          >
            <Upload size={16} className={isBuilderMode ? "text-purple-500" : "text-indigo-500"} /> Загрузить {isBuilderMode ? 'базовый DOCX' : 'шаблон'}
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".docx" className="hidden" />
        </div>

        {/* Переключатель Режимов */}
        {!isBuilderMode && placeholders.length > 0 && (
          <div className="relative flex p-1 bg-slate-100/50 backdrop-blur-md border border-slate-200/60 rounded-xl mt-6 mx-7 shrink-0 shadow-inner">
            <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-lg shadow-sm border border-slate-200/50 transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1) ${appMode === 'single' ? 'left-1' : 'left-[calc(50%+2px)]'}`}></div>
            <button onClick={() => setAppMode('single')} className={`relative z-10 flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${appMode === 'single' ? 'text-indigo-700' : 'text-slate-400 hover:text-slate-600'}`}>Один файл</button>
            <button onClick={() => setAppMode('batch')} className={`relative z-10 flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${appMode === 'batch' ? 'text-indigo-700' : 'text-slate-400 hover:text-slate-600'}`}>Массив (Excel)</button>
          </div>
        )}

        {/* ДИНАМИЧЕСКАЯ ЗОНА КОНТЕНТА САЙДБАРА */}
        <div className="flex-1 overflow-y-auto p-7 pt-4 space-y-6 bg-transparent scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
          
          {isBuilderMode ? (
            <div className="space-y-4 animate-in fade-in duration-300">
               <div className="mb-6 flex items-start justify-between">
                 <div>
                   <h3 className="text-[11px] font-bold text-purple-900 uppercase tracking-widest mb-2 flex items-center gap-2">Инспектор разметки</h3>
                   <p className="text-[11px] text-purple-700/60 leading-relaxed">Выделяйте текст в документе справа. Система автоматически обернет его в динамические переменные.</p>
                 </div>
                 {replacements.length > 0 && (
                   <button 
                     onClick={undoLastReplacement} 
                     className="p-1.5 ml-3 bg-purple-50 text-purple-600 hover:text-purple-900 hover:bg-purple-100 rounded-md transition-colors border border-purple-100 shadow-sm shrink-0" 
                     title="Отменить последнее действие (Ctrl+Z)"
                   >
                     <Undo2 size={16} />
                   </button>
                 )}
               </div>
               
               {groupedReplacements.length > 0 ? groupedReplacements.map(group => (
                 <div 
                   key={group.tag} 
                   onClick={() => document.getElementById(`builder-tag-${group.ids[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                   className="bg-white border border-purple-100 rounded-xl p-4 shadow-[0_2px_10px_rgba(168,85,247,0.04)] relative group hover:border-purple-300 transition-all cursor-pointer"
                 >
                    <div className="flex justify-between items-center mb-2.5">
                      <div className="font-bold text-purple-700 text-sm tracking-wide bg-purple-50 px-2 py-0.5 rounded-md inline-block pointer-events-none">
                        {'{' + group.tag + '}'}
                      </div>
                      <span className="text-[10px] font-bold text-purple-300 bg-white border border-purple-100 px-1.5 py-0.5 rounded-full pointer-events-none">x{group.ids.length}</span>
                    </div>

                    <div className="space-y-1.5 pointer-events-none">
                      {group.originalTexts.map((text, idx) => (
                        <div key={idx} className="text-[10px] text-slate-500 font-medium line-clamp-1 border-l-2 border-purple-200 pl-2">
                          "{text}"
                        </div>
                      ))}
                    </div>

                    {group.comments.length > 0 && (
                      <div className="text-[10px] text-slate-500 mt-3 flex gap-1.5 items-start bg-slate-50 p-2 rounded-md pointer-events-none">
                        <Info size={12} className="mt-0.5 text-purple-400 shrink-0"/> 
                        <span className="leading-snug">{group.comments[0]}</span>
                      </div>
                    )}

                    <button 
                      onClick={(e) => { e.stopPropagation(); setReplacements(replacements.filter(r => r.tag !== group.tag)); }} 
                      className="absolute top-3 right-3 p-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-50 rounded-md transition-all"
                      title="Удалить все привязки этой метки"
                    >
                      <Trash2 size={14}/>
                    </button>
                 </div>
               )) : (
                 <div className="opacity-40 text-center mt-16">
                    <PenTool size={40} strokeWidth={1.5} className="mx-auto mb-4 text-purple-400"/>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-purple-600">Ожидание выделения текста</p>
                 </div>
               )}
            </div>
          ) : (
             appMode === 'single' ? (
              placeholders.length > 0 ? (
                <>
                  <div className="sticky top-0 bg-[#F8FAFC]/95 backdrop-blur-md pb-4 pt-1 z-10 border-b border-slate-100 mb-2 flex items-center justify-between">
                    <div className="w-full mr-4">
                      <div className="flex justify-between items-end mb-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Прогресс</span>
                        <span className="text-[10px] font-bold text-indigo-600">{filledFields} / {totalFields}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all duration-500 rounded-full" style={{ width: `${progressPercent}%` }}></div>
                      </div>
                    </div>
                    {!isComplete && (
                      <button 
                        onClick={focusNextEmpty} 
                        className="shrink-0 flex items-center justify-center p-2 rounded-full bg-amber-50 text-amber-600 hover:bg-amber-100 hover:text-amber-700 transition-colors shadow-sm border border-amber-200/50"
                        title="К следующему пустому полю"
                      >
                        <ArrowRight size={16} />
                      </button>
                    )}
                  </div>

                  {placeholders.map(({ key, comment }, index) => {
                    const isFilled = !!formData[key];
                    return (
                      <div key={key} className="relative group">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${isFilled ? 'bg-indigo-400' : 'bg-amber-400 animate-pulse'}`}></div>
                          <label className={`text-[10px] font-bold uppercase tracking-wider block transition-colors ${activeField === key ? 'text-indigo-600' : 'text-slate-500'}`}>
                            {key.replace(/_/g, ' ')}
                          </label>
                        </div>
                        <input 
                          id={`input-${key}`}
                          type="text" 
                          onFocus={() => { setActiveField(key); document.getElementById(`target-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} 
                          onBlur={() => setActiveField(null)} 
                          onPaste={(e) => handleBulkPaste(e, index)} 
                          className={`w-full bg-white border rounded-xl px-4 py-3.5 text-sm outline-none transition-all shadow-sm ${activeField === key ? 'border-indigo-400 ring-4 ring-indigo-500/10' : (!isFilled ? 'border-amber-200 hover:border-amber-300 focus:border-indigo-400' : 'border-slate-200 hover:border-slate-300 focus:border-indigo-400')}`} 
                          placeholder="Введите значение..." 
                          value={formData[key] || ''} 
                          onChange={(e) => setFormData({...formData, [key]: e.target.value})} 
                        />
                        {comment && <div className="flex gap-2 mt-2 px-1 items-start"><Info size={12} className="text-indigo-400 shrink-0 mt-0.5" /><p className="text-[11px] text-slate-500 leading-relaxed">{comment}</p></div>}
                      </div>
                    )
                  })}
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-40 mt-20">
                    <FileText size={48} strokeWidth={1} className="mb-4 text-slate-400" />
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Ожидание шаблона</p>
                </div>
              )
            ) : (
              <div className="space-y-6 animate-in fade-in duration-300">
                {batchData.length === 0 ? (
                  <>
                    <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-5">
                      <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-wider mb-2 flex items-center gap-2"><TableProperties size={14}/> 1. Подготовка данных</h3>
                      <button onClick={downloadExcelTemplate} className="w-full mt-4 bg-white text-indigo-600 border border-indigo-200 hover:border-indigo-300 py-2.5 rounded-lg text-xs font-semibold transition-all shadow-sm">Скачать Excel-шаблон</button>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2"><Users size={14}/> 2. Загрузка данных</h3>
                      <button onClick={() => batchFileInputRef.current.click()} className="w-full bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 border-dashed py-6 rounded-lg text-xs font-medium transition-all flex flex-col items-center gap-2"><Upload size={20} className="text-slate-400" /> Загрузить Excel</button>
                      <input type="file" ref={batchFileInputRef} onChange={handleBatchImport} accept=".xlsx, .xls, .csv" className="hidden" />
                    </div>
                  </>
                ) : (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between bg-emerald-50/80 border border-emerald-100 p-3 rounded-xl shadow-sm">
                      <span className="flex items-center gap-2 text-[11px] font-bold text-emerald-700 uppercase tracking-wider"><CheckCircle2 size={16} /> Массив загружен ({batchData.length})</span>
                      <button onClick={() => { setBatchData([]); setBatchPreviewIndex(0); }} className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800 uppercase tracking-wider transition-colors">Сбросить</button>
                    </div>

                    {/* ИЗМЕНЕНИЕ 3: Интеграция Zen Progress для Batch Mode */}
                    <div className="sticky top-0 bg-[#F8FAFC]/95 backdrop-blur-md pb-4 pt-1 z-10 border-b border-slate-100 mb-2 flex items-center justify-between mt-4">
                      <div className="w-full mr-4">
                        <div className="flex justify-between items-end mb-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Прогресс документа {batchPreviewIndex + 1}</span>
                          <span className="text-[10px] font-bold text-indigo-600">{filledFields} / {totalFields}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 transition-all duration-500 rounded-full" style={{ width: `${progressPercent}%` }}></div>
                        </div>
                      </div>
                      {!isComplete && (
                        <button 
                          onClick={focusNextEmpty} 
                          className="shrink-0 flex items-center justify-center p-2 rounded-full bg-amber-50 text-amber-600 hover:bg-amber-100 hover:text-amber-700 transition-colors shadow-sm border border-amber-200/50"
                          title="К следующему пустому полю"
                        >
                          <ArrowRight size={16} />
                        </button>
                      )}
                    </div>

                    {placeholders.map(({ key, comment }) => {
                      const isFilled = !!currentFormData[key];
                      return (
                        <div key={key} className="relative group">
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${isFilled ? 'bg-indigo-400' : 'bg-amber-400 animate-pulse'}`}></div>
                            <label className={`text-[10px] font-bold uppercase tracking-wider block transition-colors ${activeField === key ? 'text-indigo-600' : 'text-slate-500'}`}>
                              {key.replace(/_/g, ' ')}
                            </label>
                          </div>
                          <input 
                            id={`input-${key}`}
                            type="text" 
                            onFocus={() => { setActiveField(key); document.getElementById(`target-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} 
                            onBlur={() => setActiveField(null)} 
                            className={`w-full bg-white border rounded-xl px-4 py-3.5 text-sm outline-none transition-all shadow-sm ${activeField === key ? 'border-indigo-400 ring-4 ring-indigo-500/10' : (!isFilled ? 'border-amber-200 hover:border-amber-300 focus:border-indigo-400' : 'border-slate-200 hover:border-slate-300 focus:border-indigo-400')}`} 
                            value={(batchData[batchPreviewIndex] && batchData[batchPreviewIndex][key]) || ''} 
                            onChange={(e) => handleBatchDataChange(key, e.target.value)} 
                          />
                          {comment && <div className="flex gap-2 mt-2 px-1 items-start"><Info size={12} className="text-indigo-400 shrink-0 mt-0.5" /><p className="text-[11px] text-slate-500 leading-relaxed">{comment}</p></div>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {/* КНОПКА ЭКСПОРТА (МЕНЯЕТСЯ ОТ РЕЖИМА) */}
        <div className="p-6 bg-white/80 backdrop-blur-md border-t border-slate-200/60 flex justify-center shrink-0">
          {isBuilderMode ? (
             <button 
              onClick={exportTemplate} 
              disabled={!originalBuffer || replacements.length === 0 || isProcessing} 
              className="w-full h-12 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-3 shadow-[0_8px_20px_rgba(168,85,247,0.25)] transition-all active:scale-[0.98] disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed"
            >
              {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <><Download size={18} /><span>Скачать DOCX Шаблон</span></>}
            </button>
          ) : (
            appMode === 'single' ? (
              <button 
                onClick={() => {
                  if (!isComplete && !exportConfirm) { setExportConfirm(true); return; }
                  exportOriginalWithData();
                }} 
                disabled={!originalBuffer || isProcessing} 
                className={`w-full h-12 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed ${
                  exportConfirm 
                  ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-[0_8px_20px_rgba(245,158,11,0.25)]' 
                  : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-[0_8px_20px_rgba(79,70,229,0.25)]'
                }`}
              >
                {isProcessing ? <Loader2 className="animate-spin" size={18} /> : (
                  exportConfirm ? <><AlertCircle size={18} /><span>Остались пустые поля. Скачать?</span></> : <><Download size={18} /><span>Создать документ</span></>
                )}
              </button>
            ) : (
              // ИЗМЕНЕНИЕ 4: Smart Guard Export для Batch Mode
              <button 
                onClick={() => {
                  if (!isBatchComplete && !exportConfirm) { setExportConfirm(true); return; }
                  exportBatchDocs();
                }} 
                disabled={!originalBuffer || isProcessing || batchData.length === 0} 
                className={`w-full h-12 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed ${
                  (exportConfirm && !isBatchComplete)
                  ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-[0_8px_20px_rgba(245,158,11,0.25)]' 
                  : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-[0_8px_20px_rgba(79,70,229,0.25)]'
                }`}
              >
                {isProcessing ? <Loader2 className="animate-spin" size={18} /> : (
                  (exportConfirm && !isBatchComplete) ? <><AlertCircle size={18} /><span>Есть пропуски. Создать?</span></> : <><Download size={18} /><span>Создать архив ({batchData.length} шт)</span></>
                )}
              </button>
            )
          )}
        </div>
      </aside>

      {/* ПРЕВЬЮ ДОКУМЕНТА */}
      <main className="flex-1 overflow-y-auto relative p-12 scroll-smooth bg-slate-50/50">
        
        <div className="absolute top-8 right-12 z-40">
          <button
            onClick={() => { setIsBuilderMode(!isBuilderMode); window.getSelection().removeAllRanges(); setSelectionRect(null); }}
            className={`flex items-center gap-2.5 px-5 py-2.5 rounded-full font-black text-[10px] uppercase tracking-[0.2em] backdrop-blur-xl transition-all duration-500 border shadow-2xl ${
              isBuilderMode 
              ? 'bg-purple-900/90 text-purple-100 border-purple-500/50 shadow-purple-900/20 hover:bg-purple-800' 
              : 'bg-white/80 text-slate-400 border-white hover:text-purple-600 hover:bg-white shadow-slate-200/50 hover:shadow-purple-500/10'
            }`}
          >
            <Settings size={14} className={`${isBuilderMode ? 'animate-[spin_4s_linear_infinite] text-purple-300' : ''}`} />
            {isBuilderMode ? 'Выйти из Builder' : 'Builder Mode'}
          </button>
        </div>

        <div className={`fixed top-[-15%] right-[-5%] w-[60vw] h-[60vw] rounded-full blur-[140px] pointer-events-none transition-colors duration-1000 ${isBuilderMode ? 'bg-gradient-to-bl from-purple-200/20 via-pink-200/10 to-transparent' : 'bg-gradient-to-bl from-indigo-200/20 via-purple-200/20 to-transparent'}`}></div>
        
        <div className="max-w-4xl mx-auto relative z-10 pt-10">
            <div 
              onMouseUp={handleDocumentMouseUp}
              className={`w-full min-h-[1120px] p-[25mm] relative rounded-sm border overflow-hidden bg-white shadow-[0_20px_40px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.02)] transition-colors duration-500 ${isBuilderMode ? 'border-purple-200/60 selection:bg-purple-200 selection:text-purple-900 cursor-text' : 'border-slate-200/60'}`}
            >
                <div className="flex justify-between items-center mb-12 border-b border-slate-100 pb-6 relative z-10 pointer-events-none">
                    <div className="flex items-center gap-3">
                        <Scale size={20} className={isBuilderMode ? "text-purple-300" : "text-indigo-300"} />
                        <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-400">{isBuilderMode ? 'Markup Canvas' : 'Preview Mode'}</span>
                    </div>

                    {!isBuilderMode && appMode === 'batch' && batchData.length > 0 && (
                      <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full pointer-events-auto">
                        <button onClick={() => setBatchPreviewIndex(Math.max(0, batchPreviewIndex - 1))} disabled={batchPreviewIndex === 0} className="p-1 hover:bg-slate-200 rounded-full disabled:opacity-30 transition-colors"><ChevronLeft size={14} /></button>
                        <span className="text-[11px] font-bold text-slate-600 tracking-wider">Документ {batchPreviewIndex + 1} <span className="text-slate-400 font-normal">из</span> {batchData.length}</span>
                        <button onClick={() => setBatchPreviewIndex(Math.min(batchData.length - 1, batchPreviewIndex + 1))} disabled={batchPreviewIndex === batchData.length - 1} className="p-1 hover:bg-slate-200 rounded-full disabled:opacity-30 transition-colors"><ChevronRight size={14} /></button>
                      </div>
                    )}

                    {!isBuilderMode && isComplete && appMode === 'single' && <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-full"><CheckCircle2 size={14} className="text-emerald-500" /><span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Ready</span></div>}
                </div>
                
                <style>{`
                  .document-preview { font-family: 'Times New Roman', Times, serif; line-height: 1.6; text-align: justify; color: #0f172a; font-size: 11pt; position: relative; z-index: 10; }
                  .document-preview p { margin-bottom: 14pt; }
                  .document-preview span { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
                  .builder-tag { background: #faf5ff; color: #7e22ce; font-weight: 600; padding: 2px 4px; border-radius: 4px; border-bottom: 2px solid #c084fc; box-shadow: 0 1px 2px rgba(168,85,247,0.1); font-family: ui-sans-serif, system-ui, sans-serif; font-size: 0.9em; scroll-margin-top: 200px; }
                `}</style>

                {htmlContent ? (
                    <div className="document-preview" dangerouslySetInnerHTML={{ __html: processedHtmlPreview }} />
                ) : (
                    <div className="h-[800px] flex flex-col items-center justify-center opacity-20 pointer-events-none">
                         <span className="text-4xl font-light tracking-[0.5em] uppercase text-slate-400">Lumina</span>
                    </div>
                )}
            </div>
        </div>
      </main>
    </div>
  );
}