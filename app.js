/**
 * ============================================================================
 * COGNITIVE MATRIX ENGINE - VIBE CODER EDITION (v3.1 Stable)
 * Backend: Google Apps Script (Headless)
 * AI Engine: Google Gemini Multimodal Live (WebSocket)
 * ============================================================================
 */

// --- 1. CONFIGURATION ---
// Link Backend Google Apps Script Anda (PASTIKAN INI SESUAI DEPLOYMENT ANDA)
const API_URL = "https://script.google.com/macros/s/AKfycbxqpGjOd079nX9D2BCSpWxFbUtPJRpAHT70SrRxoP8bqwqrSPf1_pvC7bhnb75jx_Q5Yg/exec";

// API Key Gemini (Dapatkan di aistudio.google.com)
// PERINGATAN: Jangan commit file ini ke repo publik jika berisi key asli!
const GEMINI_API_KEY = "AIzaSyDyU5PcZyshb5mDQoyyXt7fTcbfEkcLQ3Q"; 

// UPDATE: Menggunakan versi STABLE, bukan Experimental lagi
const GEMINI_MODEL = "models/gemini-2.5-flash";

// --- 2. GLOBAL STATE ---
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

// --- 3. INITIALIZATION ---
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

// --- 4. BACKEND BRIDGE (Fetch API) ---
async function callBackend(action, data = {}, method = 'GET') {
    let url = API_URL;
    let options = { method: method };

    if (method === 'GET') {
        const params = new URLSearchParams({ action: action, ...data });
        url += `?${params.toString()}`;
    } else {
        // Menggunakan text/plain untuk menghindari masalah CORS preflight di GAS
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

// --- 5. VIEW CONTROLLER ---
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

// --- 6. CORE RENDERER ---
function renderMatrix() {
  const container = document.getElementById('matrix-container');
  container.innerHTML = '';
  document.getElementById('matrix-topic').innerText = appState.data.topic;
  updateModeUI();

  const table = document.createElement('table');
  table.className = 'matrix-table w-full'; 
  
  // Header
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
        <button onclick="toggleColumnVisibility(${idx})" 
                class="absolute -top-1 -right-2 p-1 hover:bg-white/10 rounded-full transition-all ${appState.mode === 'study' ? 'text-orange-300 opacity-100' : 'text-indigo-200 opacity-0 group-hover:opacity-100'}"
                title="${isHidden ? 'Buka Kolom' : 'Tutup Kolom'}">
           <span class="material-icons-outlined text-sm">${isHidden ? 'visibility_off' : 'visibility'}</span>
        </button>
      </div>`;
    th.innerHTML = html;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  // Body
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
        wrapper.innerHTML = `<div class="study-blur min-h-[60px] flex items-center justify-center" onclick="revealCell(this)"><span class="text-xs">Click to Reveal</span><div class="hidden-content hidden">${cellText}</div></div>`;
      } else {
        const contentDiv = document.createElement('div');
        contentDiv.className = 'item-content min-h-[60px]';
        contentDiv.contentEditable = (appState.mode === 'edit'); 
        contentDiv.innerHTML = cellText; 
        contentDiv.onblur = function() { updateCellData(rIdx, cIdx, this.innerHTML); };
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
  
  // Summary
  const sumContainer = document.getElementById('summary-container');
  let sumHTML = appState.data.summary;
  if(!sumHTML.includes('summary-box')) {
     sumHTML = `<div class="summary-box"><span class="summary-title">Executive Summary</span><div class="summary-text" contenteditable="${appState.mode === 'edit'}" id="summary-text-editor">${sumHTML}</div></div>`;
  }
  sumContainer.innerHTML = sumHTML;
  const sumEditor = document.getElementById('summary-text-editor');
  if(sumEditor) {
    sumEditor.contentEditable = (appState.mode === 'edit');
    sumEditor.addEventListener('blur', function() { appState.data.summary = this.innerHTML; appState.isDirty = true; });
  }

  // Sortable
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

// --- 7. LOGIC & DATA HANDLING ---
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
    if(confirm("Beralih ke Edit Mode untuk mengubah struktur?")) switchAppMode('edit'); else return;
  }
  if (action === 'add-row') {
    appState.data.rows.push({ id: 'local-' + Math.random().toString(36).substr(2, 9), cells: new Array(appState.data.columns.length).fill("") });
  } else if (action === 'add-col') {
    appState.data.columns.push("Pilar Baru");
    appState.data.rows.forEach(row => row.cells.push(""));
  }
  appState.isDirty = true;
  renderMatrix();
}

function updateHeader(colIdx, newText) {
  if (appState.data.columns[colIdx] !== newText) { appState.data.columns[colIdx] = newText; appState.isDirty = true; }
}

function updateCellData(rIdx, cIdx, newHtml) {
  if (appState.data.rows[rIdx].cells[cIdx] !== newHtml) { appState.data.rows[rIdx].cells[cIdx] = newHtml; appState.isDirty = true; }
}

function toggleColumnVisibility(colIdx) {
  const index = appState.hiddenCols.indexOf(colIdx);
  if (index > -1) appState.hiddenCols.splice(index, 1); else appState.hiddenCols.push(colIdx);
  renderMatrix(); 
}

function revealCell(el) {
  const content = el.querySelector('.hidden-content').innerHTML;
  const parent = el.parentElement;
  parent.innerHTML = `<div class='item-content study-reveal p-1'>${content}</div>`;
}

// --- 8. AI TEXT REFINEMENT ---
function openAiMenu(e, type, rIdx = null, cIdx = null) {
  e.stopPropagation(); 
  appState.contextTarget = { type, rIdx, cIdx };
  const menu = document.getElementById('ai-context-menu');
  menu.style.left = `${e.clientX - 280}px`; menu.style.top = `${e.clientY + 10}px`;
  menu.classList.remove('hidden');
}

function closeAiMenu() {
  document.getElementById('ai-context-menu').classList.add('hidden');
  appState.contextTarget = null;
}

function triggerAiMenuManual() {
  alert("Hover di pojok kanan atas sel tabel untuk memunculkan ikon AI.");
}

function executeAiAction(action) {
  const target = appState.contextTarget;
  if (!target) return;
  closeAiMenu();
  setLoading(true, "AI sedang memoles...");
  
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
    if (action === 'shorten') instruction = "Persingkat kalimat ini menjadi 3-5 kata kunci yang padat.";
    if (action === 'formalize') instruction = "Ubah bahasa menjadi sangat formal, diplomatis, dan profesional.";
    if (action === 'example') instruction = "Tambahkan contoh konkret singkat dalam kurung.";
  }

  callBackend('aiRefineData', { currentData: contentToRefine, instruction: instruction, scope: scope, contextInfo: contextInfo }, 'POST')
  .then(res => {
      setLoading(false);
      if (res.status === 'success') {
        if (scope === 'cell') appState.data.rows[target.rIdx].cells[target.cIdx] = res.result;
        else if (scope === 'column' && Array.isArray(res.result)) appState.data.rows.forEach((row, i) => { if (res.result[i]) row.cells[target.cIdx] = res.result[i]; });
        appState.isDirty = true;
        renderMatrix();
        showToast("Refinement Berhasil!", "success");
      } else showToast("Gagal: " + res.message, "error");
  })
  .catch(e => { setLoading(false); showToast("Error Koneksi", "error"); });
}

// --- 9. SERVER CRUD OPERATIONS ---
function processScript() {
  const topic = document.getElementById('input-topic').value;
  const content = document.getElementById('input-content').value;
  const colCount = document.getElementById('setting-columns').value;
  if(!topic || !content) return showToast("Mohon isi Topik & Konten", "error");
  setLoading(true, "Menganalisis...");
  
  callBackend('generateMatrix', { topic: topic, content: content, options: { columnCount: parseInt(colCount) } }, 'POST')
  .then(res => {
      setLoading(false);
      if(res.status === 'success') {
        appState.id = res.id; appState.data = res.data; appState.mode = 'edit'; appState.hiddenCols = [];
        localStorage.removeItem('draft_topic'); localStorage.removeItem('draft_content');
        hideAllViews(); document.getElementById('view-result').classList.remove('hidden'); document.getElementById('btn-home').classList.remove('hidden');
        renderMatrix();
      } else showToast(res.message, "error");
  }).catch(e => { setLoading(false); showToast("Error: " + e, "error"); });
}

function saveChanges() {
  if(!appState.id) return showToast("Data belum dimuat", "error");
  const sumEl = document.querySelector('.summary-text');
  if(sumEl) appState.data.summary = sumEl.innerHTML; 
  setLoading(true, "Menyimpan...");
  
  callBackend('saveFinalMapping', { id: appState.id, jsonString: JSON.stringify(appState.data), statusDesc: 'User Edited' }, 'POST')
  .then(res => {
      setLoading(false);
      if(res.status === 'success') { appState.isDirty = false; showToast("Tersimpan!", "success"); } else showToast("Gagal simpan", "error");
  }).catch(e => { setLoading(false); showToast("Error simpan", "error"); });
}

function loadTopicList(isStudySelector = false) {
  setLoading(true, "Mengambil arsip...");
  const container = document.getElementById(isStudySelector ? 'study-list-container' : 'list-container');
  if (!container) return;
  container.innerHTML = '<div class="p-8 text-center text-slate-400">Loading...</div>'; 
  
  callBackend('getTopicList').then(res => {
    setLoading(false); container.innerHTML = '';
    const list = res.data || []; 
    if(!list.length) { container.innerHTML = '<div class="p-4 text-center text-slate-500">Belum ada data.</div>'; return; }
    list.forEach(item => {
      const div = document.createElement('div');
      div.className = "p-4 hover:bg-orange-50 cursor-pointer transition-colors flex justify-between items-center group";
      div.onclick = () => loadEntry(item.id, 'study'); 
      div.innerHTML = `<div><h4 class="font-bold text-slate-800 group-hover:text-orange-700">${item.topic}</h4><p class="text-xs text-slate-500 line-clamp-1">${item.preview || 'No preview'}</p></div><div class="flex items-center gap-2"><button onclick="event.stopPropagation(); loadEntry('${item.id}', 'edit')" class="text-xs font-bold text-indigo-300 hover:text-indigo-600 px-2 py-1 rounded">EDIT</button><span class="material-icons-outlined text-slate-300 group-hover:text-orange-500">play_circle</span></div>`;
      container.appendChild(div);
    });
  }).catch(e => { setLoading(false); container.innerHTML = '<div class="p-4 text-center text-red-500">Gagal mengambil data.</div>'; });
}

function loadEntry(id, mode) {
  setLoading(true, "Membuka Matriks...");
  callBackend('getMatrixData', { id: id }).then(res => {
       setLoading(false);
       if(res.status === 'success') {
         appState.id = id; appState.data = res.data; appState.mode = mode; 
         appState.hiddenCols = (mode === 'study') ? appState.data.columns.map((_, i) => i) : [];
         hideAllViews(); document.getElementById('view-result').classList.remove('hidden'); document.getElementById('btn-home').classList.remove('hidden');
         renderMatrix();
       } else showToast("Gagal: " + res.message, "error");
  }).catch(e => { setLoading(false); showToast("Connection Error", "error"); });
}

// --- 10. UTILITIES ---
function formatCmd(cmd, value = null) { document.execCommand(cmd, false, value); }
function exportToPDF() {
  const element = document.getElementById('capture-area');
  const originalShadow = element.style.boxShadow;
  element.style.boxShadow = 'none'; document.body.classList.add('printing');
  const { jsPDF } = window.jspdf;
  html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' }).then(canvas => {
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('l', 'mm', 'a4'); 
    const imgWidth = pdf.internal.pageSize.getWidth() - 20; 
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
    pdf.save(`Matrix-${appState.data.topic}.pdf`);
    showToast("PDF didownload!", "success");
    element.style.boxShadow = originalShadow; document.body.classList.remove('printing');
  });
}
function downloadImage() {
  const element = document.getElementById('capture-area');
  html2canvas(element, { scale: 2, backgroundColor: '#ffffff' }).then(canvas => {
    const link = document.createElement('a'); link.download = `Matrix-${appState.data.topic}.png`; link.href = canvas.toDataURL('image/png'); link.click();
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
  if(isLoading) { document.getElementById('loading-text').innerText = text; el.classList.remove('hidden'); } else el.classList.add('hidden');
}

/* ==========================================================================
   11. GEMINI LIVE INTERFACE (REAL-TIME WEBSOCKET)
   ========================================================================== */

let liveState = {
  isConnected: false, ws: null, audioContext: null, mediaStream: null, workletNode: null, audioQueue: [], isPlaying: false, nextPlayTime: 0
};

async function toggleLiveInterview() {
  const btn = document.getElementById('btn-live-interview');
  const text = document.getElementById('live-status-text');
  const indicator = document.getElementById('live-indicator');

  if (liveState.isConnected) {
    stopLiveSession();
    btn.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold transition-colors border border-rose-100 relative overflow-hidden group";
    text.innerText = "Live Interview";
    indicator.classList.add('hidden');
  } else {
    if(!appState.data.rows.length) return showToast("Data matriks kosong!", "error");
    if(GEMINI_API_KEY.includes("PASTE")) return showToast("API Key belum diset di app.js!", "error");

    btn.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 text-xs font-bold transition-colors border border-rose-600 relative overflow-hidden group";
    text.innerText = "Connecting...";
    try {
      await startLiveSession();
      text.innerText = "Listening...";
      indicator.classList.remove('hidden');
    } catch (e) {
      console.error(e); showToast("Gagal connect: " + e.message, "error"); stopLiveSession();
    }
  }
}

async function startLiveSession() {
  liveState.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
  await liveState.audioContext.resume();

  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
  liveState.ws = new WebSocket(url);

  liveState.ws.onopen = () => {
    liveState.isConnected = true;
    showToast("Terhubung ke Gemini Live!", "success");
    
    // Setup Msg (UPDATE MODEL)
    liveState.ws.send(JSON.stringify({ setup: { model: GEMINI_MODEL, generationConfig: { responseModalities: ["AUDIO"] } } }));

    // Context Prompt
    const contextPrompt = `
      You are a professional Interviewer for OJK (Otoritas Jasa Keuangan). 
      Conduct a mock interview based on my matrix:
      Topic: ${appState.data.topic}
      Summary: ${appState.data.summary}
      Key Points: ${JSON.stringify(appState.data.rows.map(r => r.cells))}
      
      Instructions:
      1. Speak in Indonesian (Bahasa Indonesia).
      2. Start by greeting me and asking the first relevant question.
      3. Keep responses concise and conversational.
      4. Ask one question at a time.
    `;
    
    liveState.ws.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text: contextPrompt }] }], turnComplete: true } }));
    startRecording();
  };

  liveState.ws.onmessage = async (event) => {
    let data;
    if (event.data instanceof Blob) data = JSON.parse(await event.data.text()); else data = JSON.parse(event.data);
    if (data.serverContent?.modelTurn?.parts) {
      for (const part of data.serverContent.modelTurn.parts) {
        if (part.inlineData) queueAudio(base64ToFloat32(part.inlineData.data));
      }
    }
  };

  liveState.ws.onclose = () => { if(liveState.isConnected) stopLiveSession(); };
}

function stopLiveSession() {
  liveState.isConnected = false;
  if (liveState.ws) { liveState.ws.close(); liveState.ws = null; }
  if (liveState.mediaStream) { liveState.mediaStream.getTracks().forEach(track => track.stop()); liveState.mediaStream = null; }
  if (liveState.workletNode) { liveState.workletNode.disconnect(); liveState.workletNode = null; }
  if (liveState.audioContext) { liveState.audioContext.close(); liveState.audioContext = null; }
  liveState.audioQueue = []; liveState.isPlaying = false;
}

async function startRecording() {
  liveState.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } });
  
  // Worklet Processor Injection
  const workletCode = `
    class RecorderProcessor extends AudioWorkletProcessor {
      process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length > 0) {
          const float32Data = input[0];
          const int16Data = new Int16Array(float32Data.length);
          for (let i = 0; i < float32Data.length; i++) {
             let s = Math.max(-1, Math.min(1, float32Data[i]));
             int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          this.port.postMessage(int16Data.buffer);
        }
        return true;
      }
    }
    registerProcessor('recorder-processor', RecorderProcessor);
  `;

  const blob = new Blob([workletCode], { type: "application/javascript" });
  await liveState.audioContext.audioWorklet.addModule(URL.createObjectURL(blob));
  
  const source = liveState.audioContext.createMediaStreamSource(liveState.mediaStream);
  liveState.workletNode = new AudioWorkletNode(liveState.audioContext, 'recorder-processor');
  
  liveState.workletNode.port.onmessage = (event) => {
    if (!liveState.isConnected || !liveState.ws || liveState.ws.readyState !== WebSocket.OPEN) return;
    liveState.ws.send(JSON.stringify({ realtimeInput: { mediaChunks: [{ mimeType: "audio/pcm", data: arrayBufferToBase64(event.data) }] } }));
  };
  source.connect(liveState.workletNode);
  liveState.workletNode.connect(liveState.audioContext.destination);
}

function queueAudio(pcmFloat32) {
  liveState.audioQueue.push(pcmFloat32);
  if (!liveState.isPlaying) playNextChunk();
}

function playNextChunk() {
  if (liveState.audioQueue.length === 0) { liveState.isPlaying = false; return; }
  liveState.isPlaying = true;
  const pcmData = liveState.audioQueue.shift();
  const buffer = liveState.audioContext.createBuffer(1, pcmData.length, liveState.audioContext.sampleRate);
  buffer.getChannelData(0).set(pcmData);
  const source = liveState.audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(liveState.audioContext.destination);
  const currentTime = liveState.audioContext.currentTime;
  const startTime = Math.max(currentTime, liveState.nextPlayTime);
  source.start(startTime);
  liveState.nextPlayTime = startTime + buffer.duration;
  setTimeout(playNextChunk, (buffer.duration * 1000) - 10); 
}

function base64ToFloat32(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for(let i=0; i<int16.length; i++) { float32[i] = int16[i] / 32768.0; }
  return float32;
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) { binary += String.fromCharCode(bytes[i]); }
  return window.btoa(binary);
}

