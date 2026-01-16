/**
 * ============================================================================
 * COGNITIVE MATRIX ENGINE - FRONTEND CONTROLLER (HEADLESS EDITION)
 * Connected to: Google Apps Script Backend
 * ============================================================================
 */

// --- CONFIGURATION ---
const API_URL = "https://script.google.com/macros/s/AKfycbxqpGjOd079nX9D2BCSpWxFbUtPJRpAHT70SrRxoP8bqwqrSPf1_pvC7bhnb75jx_Q5Yg/exec";

// --- GLOBAL STATE ---
let appState = {
  id: null,              
  data: {                
    topic: "Untitled",
    columns: [],
    rows: [],
    summary: ""
  },
  mode: 'edit',          
  hiddenCols: [],        
  contextTarget: null,   
  isDirty: false         
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  const draftTopic = localStorage.getItem('draft_topic');
  const draftContent = localStorage.getItem('draft_content');
  if(draftTopic && document.getElementById('input-topic')) document.getElementById('input-topic').value = draftTopic;
  if(draftContent && document.getElementById('input-content')) document.getElementById('input-content').value = draftContent;

  if(document.getElementById('input-topic')) {
    document.getElementById('input-topic').addEventListener('input', (e) => localStorage.setItem('draft_topic', e.target.value));
  }
  if(document.getElementById('input-content')) {
    document.getElementById('input-content').addEventListener('input', (e) => localStorage.setItem('draft_content', e.target.value));
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#ai-context-menu') && !e.target.closest('.ai-trigger-btn')) {
      closeAiMenu();
    }
  });
});

// --- BACKEND COMMUNICATION (REPLACEMENT FOR google.script.run) ---
async function callBackend(action, data = {}, method = 'GET') {
    let url = API_URL;
    let options = {
        method: method,
    };

    if (method === 'GET') {
        // Construct Query Params
        const params = new URLSearchParams({ action: action, ...data });
        url += `?${params.toString()}`;
    } else {
        // POST Request - Mengirim sebagai text/plain untuk menghindari CORS preflight GAS yang ketat
        options.body = JSON.stringify({ action: action, ...data });
        options.headers = { "Content-Type": "text/plain;charset=utf-8" };
    }

    try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const json = await response.json();
        return json;
    } catch (error) {
        console.error("Backend Error:", error);
        throw error;
    }
}

// --- NAVIGATION & VIEW CONTROLLER ---

function hideAllViews() {
  document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
  window.scrollTo(0,0);
}

function showHome() {
  hideAllViews();
  document.getElementById('view-home').classList.remove('hidden');
  document.getElementById('btn-home').classList.add('hidden');
}

function showGenerate() {
  hideAllViews();
  document.getElementById('view-generate').classList.remove('hidden');
  document.getElementById('btn-home').classList.remove('hidden');
}

function initStudyModeSelection() {
  hideAllViews();
  document.getElementById('view-study-select').classList.remove('hidden');
  document.getElementById('btn-home').classList.remove('hidden');
  
  loadTopicList(true); 
}

// --- CORE ENGINE: RENDERER ---

function renderMatrix() {
  const container = document.getElementById('matrix-container');
  container.innerHTML = '';
  
  document.getElementById('matrix-topic').innerText = appState.data.topic;
  
  updateModeUI();

  const table = document.createElement('table');
  table.className = 'matrix-table w-full'; 
  
  // A. HEADER
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  
  appState.data.columns.forEach((colName, idx) => {
    const th = document.createElement('th');
    const isHidden = appState.hiddenCols.includes(idx) && appState.mode === 'study'; 
    
    let html = `
      <div class="flex flex-col items-center justify-center gap-1 group relative">
        <span contenteditable="${appState.mode === 'edit'}" 
              onblur="updateHeader(${idx}, this.innerText)"
              class="outline-none border-b border-transparent focus:border-white/50 transition-colors">
              ${colName}
        </span>
    `;

    const eyeIcon = isHidden ? 'visibility_off' : 'visibility';
    const eyeClass = appState.mode === 'study' ? 'text-orange-300 opacity-100' : 'text-indigo-200 opacity-0 group-hover:opacity-100';
    
    html += `
        <button onclick="toggleColumnVisibility(${idx})" 
                class="absolute -top-1 -right-2 p-1 hover:bg-white/10 rounded-full transition-all ${eyeClass}"
                title="${isHidden ? 'Buka Kolom' : 'Tutup Kolom (Blind Test)'}">
           <span class="material-icons-outlined text-sm">${eyeIcon}</span>
        </button>
      </div>
    `;
    
    th.innerHTML = html;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  // B. BODY (ROWS)
  const tbody = document.createElement('tbody');
  
  appState.data.rows.forEach((row, rIdx) => {
    const tr = document.createElement('tr');
    tr.dataset.id = row.id;
    
    row.cells.forEach((cellText, cIdx) => {
      const td = document.createElement('td');
      const isHidden = appState.hiddenCols.includes(cIdx);
      
      const wrapper = document.createElement('div');
      wrapper.className = 'relative p-3 h-full group/cell'; 
      
      if (appState.mode === 'study' && isHidden) {
        wrapper.innerHTML = `
          <div class="study-blur min-h-[60px] flex items-center justify-center" onclick="revealCell(this)">
             <span class="text-xs">Click to Reveal</span>
             <div class="hidden-content hidden">${cellText}</div>
          </div>
        `;
      } else {
        const contentDiv = document.createElement('div');
        contentDiv.className = 'item-content min-h-[60px]';
        contentDiv.contentEditable = (appState.mode === 'edit'); 
        contentDiv.innerHTML = cellText; 
        
        contentDiv.onblur = function() {
           updateCellData(rIdx, cIdx, this.innerHTML);
        };
        
        wrapper.appendChild(contentDiv);

        if (appState.mode === 'edit') {
          const aiBtn = document.createElement('button');
          aiBtn.className = 'ai-trigger-btn absolute top-1 right-1 opacity-0 group-hover/cell:opacity-100 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white p-1 rounded transition-all shadow-sm z-20';
          aiBtn.innerHTML = '<span class="material-icons-outlined text-[10px]">auto_fix_high</span>';
          aiBtn.onclick = (e) => openAiMenu(e, 'cell', rIdx, cIdx);
          wrapper.appendChild(aiBtn);
        }
      }
      td.appendChild(wrapper);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  
  table.appendChild(tbody);
  container.appendChild(table);
  
  // C. SUMMARY
  const sumContainer = document.getElementById('summary-container');
  let sumHTML = appState.data.summary;
  if(!sumHTML.includes('summary-box')) {
     sumHTML = `
       <div class="summary-box">
         <span class="summary-title">Executive Summary</span>
         <div class="summary-text" contenteditable="${appState.mode === 'edit'}" id="summary-text-editor">${sumHTML}</div>
       </div>
     `;
  }
  sumContainer.innerHTML = sumHTML;
  
  const sumEditor = document.getElementById('summary-text-editor');
  if(sumEditor) {
    sumEditor.contentEditable = (appState.mode === 'edit');
    sumEditor.addEventListener('blur', function() {
       appState.data.summary = this.innerHTML;
       appState.isDirty = true;
    });
  }

  // D. SORTABLE
  if (appState.mode === 'edit') {
    new Sortable(tbody, {
      animation: 150,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      handle: 'td', 
      onEnd: function (evt) {
        const item = appState.data.rows.splice(evt.oldIndex, 1)[0];
        appState.data.rows.splice(evt.newIndex, 0, item);
        appState.isDirty = true;
      }
    });
  }
}

// --- NEW FEATURE: MODE SWITCHING & STRUCTURE EDIT ---

function switchAppMode(newMode) {
  appState.mode = newMode;
  renderMatrix();
}

function updateModeUI() {
  const btnEdit = document.getElementById('btn-mode-edit');
  const btnStudy = document.getElementById('btn-mode-study');
  
  if (appState.mode === 'edit') {
    btnEdit.className = "px-3 py-1.5 rounded-md text-xs font-bold transition-all bg-white text-indigo-600 shadow-sm";
    btnStudy.className = "px-3 py-1.5 rounded-md text-xs font-bold transition-all text-slate-500 hover:text-slate-700";
  } else {
    btnEdit.className = "px-3 py-1.5 rounded-md text-xs font-bold transition-all text-slate-500 hover:text-slate-700";
    btnStudy.className = "px-3 py-1.5 rounded-md text-xs font-bold transition-all bg-white text-orange-600 shadow-sm";
  }
}

function modifyStructure(action) {
  if (appState.mode !== 'edit') {
    if(confirm("Anda sedang di Study Mode. Beralih ke Edit Mode untuk mengubah struktur?")) {
      switchAppMode('edit');
    } else {
      return;
    }
  }

  if (action === 'add-row') {
    const newRow = {
      id: 'local-' + Math.random().toString(36).substr(2, 9),
      cells: new Array(appState.data.columns.length).fill("")
    };
    appState.data.rows.push(newRow);
  } 
  else if (action === 'add-col') {
    appState.data.columns.push("Pilar Baru");
    appState.data.rows.forEach(row => {
      row.cells.push("");
    });
  }

  appState.isDirty = true;
  renderMatrix();
  showToast("Struktur tabel diperbarui", "success");
}


// --- STATE ACTIONS ---

function updateHeader(colIdx, newText) {
  if (appState.data.columns[colIdx] !== newText) {
    appState.data.columns[colIdx] = newText;
    appState.isDirty = true;
  }
}

function updateCellData(rIdx, cIdx, newHtml) {
  if (appState.data.rows[rIdx].cells[cIdx] !== newHtml) {
    appState.data.rows[rIdx].cells[cIdx] = newHtml;
    appState.isDirty = true;
  }
}

function toggleColumnVisibility(colIdx) {
  const index = appState.hiddenCols.indexOf(colIdx);
  if (index > -1) {
    appState.hiddenCols.splice(index, 1); 
  } else {
    appState.hiddenCols.push(colIdx); 
  }
  renderMatrix(); 
}

function revealCell(el) {
  const content = el.querySelector('.hidden-content').innerHTML;
  const parent = el.parentElement;
  
  const revealedDiv = document.createElement('div');
  revealedDiv.className = 'item-content study-reveal p-1';
  revealedDiv.innerHTML = content;
  
  parent.innerHTML = '';
  parent.appendChild(revealedDiv);
}

// --- AI REFINEMENT ---

function openAiMenu(e, type, rIdx = null, cIdx = null) {
  e.stopPropagation(); 
  appState.contextTarget = { type, rIdx, cIdx };
  const menu = document.getElementById('ai-context-menu');
  menu.style.left = `${e.clientX - 280}px`; 
  menu.style.top = `${e.clientY + 10}px`;
  menu.classList.remove('hidden');
}

function closeAiMenu() {
  document.getElementById('ai-context-menu').classList.add('hidden');
  appState.contextTarget = null;
}

function triggerAiMenuManual() {
  alert("Silakan hover di pojok kanan atas sel tabel untuk memunculkan ikon AI magic wand.");
}

function executeAiAction(action) {
  const target = appState.contextTarget;
  if (!target) return;
  
  closeAiMenu();
  setLoading(true, "AI sedang memoles kata-kata...");
  
  let contentToRefine = "";
  let contextInfo = "";
  let scope = ""; 
  let instruction = "";

  if (action === 'column-fix') {
    scope = 'column';
    const colIdx = target.cIdx;
    contentToRefine = appState.data.rows.map(row => row.cells[colIdx]);
    contextInfo = `Judul Kolom: "${appState.data.columns[colIdx]}"`;
    instruction = "Perbaiki struktur kalimat agar seragam, profesional, dan to-the-point.";
  } else {
    scope = 'cell';
    contentToRefine = appState.data.rows[target.rIdx].cells[target.cIdx];
    contextInfo = `Topik: ${appState.data.topic}, Kolom: ${appState.data.columns[target.cIdx]}`;
    if (action === 'shorten') instruction = "Persingkat kalimat ini menjadi 3-5 kata kunci yang padat (punchy).";
    if (action === 'formalize') instruction = "Ubah bahasa menjadi sangat formal, diplomatis, dan profesional (akademis).";
    if (action === 'example') instruction = "Tambahkan contoh konkret singkat dalam kurung.";
  }

  // --- CHANGED: Using callBackend ---
  callBackend('aiRefineData', {
    currentData: contentToRefine,
    instruction: instruction,
    scope: scope,
    contextInfo: contextInfo
  }, 'POST')
  .then(res => {
      setLoading(false);
      if (res.status === 'success') {
        applyAiResult(res.result, target, scope);
        showToast("Refinement Berhasil!", "success");
      } else {
        showToast("Gagal: " + res.message, "error");
      }
  })
  .catch(e => {
      setLoading(false);
      showToast("Error Koneksi: " + e, "error");
  });
}

function applyAiResult(newContent, target, scope) {
  if (scope === 'cell') {
    appState.data.rows[target.rIdx].cells[target.cIdx] = newContent;
  } else if (scope === 'column') {
    if (Array.isArray(newContent)) {
       appState.data.rows.forEach((row, i) => {
         if (newContent[i]) row.cells[target.cIdx] = newContent[i];
       });
    }
  }
  appState.isDirty = true;
  renderMatrix(); 
}

// --- SERVER INTERACTION (NEW: Uses callBackend) ---

function processScript() {
  const topic = document.getElementById('input-topic').value;
  const content = document.getElementById('input-content').value;
  const colCount = document.getElementById('setting-columns').value;
  
  if(!topic || !content) return showToast("Mohon isi Topik & Konten", "error");
  
  setLoading(true, "Menganalisis & Menyusun Matriks...");
  
  callBackend('generateMatrix', {
    topic: topic,
    content: content,
    options: { columnCount: parseInt(colCount) }
  }, 'POST')
  .then(res => {
      setLoading(false);
      if(res.status === 'success') {
        appState.id = res.id;
        appState.data = res.data;
        appState.mode = 'edit';
        appState.hiddenCols = [];
        
        localStorage.removeItem('draft_topic');
        localStorage.removeItem('draft_content');
        
        hideAllViews();
        document.getElementById('view-result').classList.remove('hidden');
        document.getElementById('btn-home').classList.remove('hidden');
        renderMatrix();
        
      } else {
        showToast(res.message, "error");
      }
  })
  .catch(e => {
      setLoading(false);
      showToast("Error: " + e, "error");
  });
}

function saveChanges() {
  if(!appState.id) return showToast("Data belum dimuat", "error");
  
  const sumEl = document.querySelector('.summary-text');
  if(sumEl) appState.data.summary = sumEl.innerHTML; 

  setLoading(true, "Menyimpan...");
  
  callBackend('saveFinalMapping', {
      id: appState.id,
      jsonString: JSON.stringify(appState.data),
      statusDesc: 'User Edited'
  }, 'POST')
  .then(res => {
      setLoading(false);
      if(res.status === 'success') {
        appState.isDirty = false;
        showToast("Perubahan tersimpan!", "success");
      } else {
        showToast("Gagal simpan", "error");
      }
  })
  .catch(e => {
      setLoading(false);
      showToast("Error simpan: " + e, "error");
  });
}

function loadTopicList(isStudySelector = false) {
  setLoading(true, "Mengambil arsip...");
  const containerId = isStudySelector ? 'study-list-container' : 'list-container'; 
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '<div class="p-8 text-center text-slate-400">Loading...</div>'; 
  
  callBackend('getTopicList')
  .then(res => {
    setLoading(false);
    container.innerHTML = '';
    
    // Perhatikan: res.data karena backend membungkusnya dalam {status, data}
    const list = res.data || []; 

    if(!list.length) {
      container.innerHTML = '<div class="p-4 text-center text-slate-500">Belum ada data.</div>';
      return;
    }
    
    list.forEach(item => {
      const div = document.createElement('div');
      
      div.className = "p-4 hover:bg-orange-50 cursor-pointer transition-colors flex justify-between items-center group";
      div.onclick = () => loadEntry(item.id, 'study'); 
      
      div.innerHTML = `
        <div>
          <h4 class="font-bold text-slate-800 group-hover:text-orange-700">${item.topic}</h4>
          <p class="text-xs text-slate-500 line-clamp-1">${item.preview || 'No preview'}</p>
        </div>
        <div class="flex items-center gap-2">
            <button onclick="event.stopPropagation(); loadEntry('${item.id}', 'edit')" class="text-xs font-bold text-indigo-300 hover:text-indigo-600 px-2 py-1 rounded">EDIT</button>
            <span class="material-icons-outlined text-slate-300 group-hover:text-orange-500">play_circle</span>
        </div>
      `;
      container.appendChild(div);
    });
  })
  .catch(e => {
    setLoading(false);
    container.innerHTML = '<div class="p-4 text-center text-red-500">Gagal mengambil data.</div>';
    console.error(e);
  });
}

function loadEntry(id, mode) {
  setLoading(true, "Membuka Matriks...");
  
  callBackend('getMatrixData', { id: id })
  .then(res => {
       setLoading(false);
       if(res.status === 'success') {
         appState.id = id;
         appState.data = res.data;
         appState.mode = mode; 
         
         if (mode === 'study') {
           appState.hiddenCols = appState.data.columns.map((_, i) => i);
         } else {
           appState.hiddenCols = [];
         }
         
         hideAllViews();
         document.getElementById('view-result').classList.remove('hidden');
         document.getElementById('btn-home').classList.remove('hidden');
         
         renderMatrix();
       } else {
         showToast("Gagal memuat data: " + res.message, "error");
       }
  })
  .catch(e => {
       setLoading(false);
       showToast("Connection Error", "error");
  });
}

function duplicateEntry(id) {
  if(!confirm("Duplikasi topik ini?")) return;
  setLoading(true);
  
  callBackend('duplicateTopic', { id: id }, 'POST')
  .then(res => {
    loadTopicList(true); 
    showToast("Berhasil diduplikasi", "success");
  })
  .catch(e => {
    setLoading(false);
    showToast("Gagal duplikasi", "error");
  });
}

// --- UTILS: EXPORT & FORMATTING ---

function formatCmd(cmd, value = null) {
  document.execCommand(cmd, false, value);
}

function exportToPDF() {
  const element = document.getElementById('capture-area');
  const originalShadow = element.style.boxShadow;
  element.style.boxShadow = 'none';
  document.body.classList.add('printing');

  const { jsPDF } = window.jspdf;
  
  html2canvas(element, {
    scale: 2, 
    useCORS: true,
    backgroundColor: '#ffffff'
  }).then(canvas => {
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('l', 'mm', 'a4'); 
    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgWidth = pageWidth - 20; 
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
    pdf.save(`Matrix-${appState.data.topic}.pdf`);
    
    showToast("PDF berhasil didownload!", "success");
    element.style.boxShadow = originalShadow;
    document.body.classList.remove('printing');
  });
}

function downloadImage() {
  const element = document.getElementById('capture-area');
  html2canvas(element, { scale: 2, backgroundColor: '#ffffff' }).then(canvas => {
    const link = document.createElement('a');
    link.download = `Matrix-${appState.data.topic}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  let colorClass = type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : 'toast-info';
  let icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info';
  toast.className = `toast-card ${colorClass}`;
  toast.innerHTML = `<span class="material-icons-outlined ${type==='error'?'text-red-500':'text-emerald-500'}">${icon}</span><span class="text-sm font-medium text-slate-700">${msg}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); toast.classList.add('hide'); setTimeout(() => toast.remove(), 400); }, 3000);
}

function setLoading(isLoading, text="Loading...") {
  const el = document.getElementById('loading-overlay');
  if(isLoading) {
    document.getElementById('loading-text').innerText = text;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}