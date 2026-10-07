const $ = (s) => document.querySelector(s);
const fileInput = $('#fileInput');
const dropzone = $('#dropzone');
const fileList = $('#fileList');
const fileCount = $('#fileCount');
const generateBtn = $('#generateBtn');
const downloadBtn = $('#downloadBtn');
const copyBtn = $('#copyBtn');
const notesOutput = $('#notesOutput');
const notesMeta = $('#notesMeta');
const progress = $('#progress');
const errorBox = $('#errorBox');
let files = [];
let latestMarkdown = '';

const allowed = new Set(['pdf','txt','md','png','jpg','jpeg','webp','gif']);
function ext(name){ return name.split('.').pop().toLowerCase(); }
function updateFiles(){
  fileCount.textContent = `${files.length} file${files.length===1?'':'s'}`;
  fileList.innerHTML = files.map((f,i)=>`<div class="file-item"><span class="file-name">${escapeHtml(f.name)}</span><button class="remove-file" data-i="${i}" title="Remove">×</button></div>`).join('');
  fileList.querySelectorAll('.remove-file').forEach(b=>b.onclick=()=>{files.splice(+b.dataset.i,1);updateFiles()});
}
function addFiles(list){
  [...list].forEach(f=>{ if(allowed.has(ext(f.name)) && !files.some(x=>x.name===f.name && x.size===f.size)) files.push(f); });
  updateFiles();
}
fileInput.addEventListener('change',e=>{addFiles(e.target.files);fileInput.value=''});
['dragenter','dragover'].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.add('drag')}));
['dragleave','drop'].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.remove('drag')}));
dropzone.addEventListener('drop',e=>addFiles(e.dataTransfer.files));
$('#browseBtn').addEventListener('click',e=>{e.preventDefault();fileInput.click()});
function escapeHtml(s){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function setProgress(title,text){progress.classList.remove('hidden');$('#progressTitle').textContent=title;$('#progressText').textContent=text;}
function fail(msg){errorBox.textContent=msg;errorBox.classList.remove('hidden');progress.classList.add('hidden');}
async function fileToPayload(file){
  const e=ext(file.name);
  if(e==='txt'||e==='md') return {name:file.name,type:'text',text:await file.text()};
  const buffer=await file.arrayBuffer();
  let binary=''; const bytes=new Uint8Array(buffer); const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  const base64=btoa(binary);
  if(['png','jpg','jpeg','webp','gif'].includes(e)) return {name:file.name,type:'image',mime:file.type||`image/${e==='jpg'?'jpeg':e}`,base64};
  return {name:file.name,type:'file',mime:file.type||'application/octet-stream',base64};
}
async function generate(){
  errorBox.classList.add('hidden');
  const pasted=$('#syllabusText').value.trim();
  if(!files.length && !pasted){fail('Please upload at least one syllabus file or paste syllabus text.');return;}
  if(!window.APP_CONFIG?.API_URL || window.APP_CONFIG.API_URL.includes('YOUR-WORKER')){fail('Set your Cloudflare Worker URL in frontend/config.js before generating notes.');return;}
  generateBtn.disabled=true; setProgress('Reading your syllabus…','Combining all uploaded sources and pasted text.');
  try{
    const payloadFiles=[]; for(const f of files) payloadFiles.push(await fileToPayload(f));
    setProgress('Building your notes…','AI is mapping units, topics, sub-topics and micro-topics.');
    const res=await fetch(window.APP_CONFIG.API_URL.replace(/\/$/,'')+'/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({files:payloadFiles,text:pasted})});
    const data=await res.json();
    if(!res.ok) throw new Error(data.error||'Generation failed.');
    latestMarkdown=data.markdown||'';
    renderNotes(latestMarkdown);
    setProgress('Notes ready','Review them below, then download the watermarked PDF.');
    setTimeout(()=>progress.classList.add('hidden'),1000);
  }catch(err){fail(err.message||'Something went wrong.');}
  finally{generateBtn.disabled=false;}
}
function renderNotes(md){
  notesOutput.classList.remove('empty-state');
  notesOutput.innerHTML=DOMPurify.sanitize(marked.parse(md));
  const words=md.trim().split(/\s+/).filter(Boolean).length;
  $('#wordCount').textContent=`${words.toLocaleString()} words`;
  $('#generatedAt').textContent=new Date().toLocaleString();
  notesMeta.classList.remove('hidden'); downloadBtn.disabled=false; copyBtn.disabled=false;
  notesOutput.scrollIntoView({behavior:'smooth',block:'start'});
}
async function copyNotes(){await navigator.clipboard.writeText(latestMarkdown);const old=copyBtn.textContent;copyBtn.textContent='Copied ✓';setTimeout(()=>copyBtn.textContent=old,1200)}
async function downloadPdf(){
  if(!latestMarkdown)return;
  downloadBtn.disabled=true; downloadBtn.textContent='Preparing PDF…';
  try{
    const clone=notesOutput.cloneNode(true); clone.classList.remove('empty-state'); clone.style.cssText='position:fixed;left:-10000px;top:0;width:794px;background:#fff;color:#171a22;padding:56px 64px;font-family:DM Sans,sans-serif;';
    document.body.appendChild(clone);
    const canvas=await html2canvas(clone,{scale:1.6,backgroundColor:'#fff',useCORS:true,windowWidth:794});
    document.body.removeChild(clone);
    const {jsPDF}=window.jspdf; const pdf=new jsPDF({orientation:'p',unit:'pt',format:'a4',compress:true});
    const pageW=pdf.internal.pageSize.getWidth(), pageH=pdf.internal.pageSize.getHeight();
    const imgW=pageW; const pagePx=Math.floor(canvas.width*pageH/pageW); let offset=0, page=0;
    while(offset<canvas.height){
      if(page>0)pdf.addPage();
      const slice=document.createElement('canvas'); slice.width=canvas.width; slice.height=Math.min(pagePx,canvas.height-offset);
      slice.getContext('2d').drawImage(canvas,0,offset,canvas.width,slice.height,0,0,canvas.width,slice.height);
      const img=slice.toDataURL('image/jpeg',.92); const imgH=slice.height*pageW/canvas.width; pdf.addImage(img,'JPEG',0,0,imgW,imgH);
      pdf.setFont('helvetica','bold');pdf.setFontSize(28);pdf.setTextColor(115,105,200);pdf.setGState?.(new pdf.GState({opacity:.13}));
      pdf.text('Aravind_Ai_Note_maker',pageW/2,pageH/2,{align:'center',angle:32});
      if(pdf.setGState)pdf.setGState(new pdf.GState({opacity:1}));
      pdf.setFontSize(8);pdf.setTextColor(125,132,145);pdf.text(`Aravind_Ai_Note_maker  •  Page ${page+1}`,pageW/2,pageH-20,{align:'center'});
      offset+=slice.height;page++;
    }
    pdf.save('Aravind_Ai_Note_maker_Notes.pdf');
  }catch(e){alert('PDF export failed: '+e.message)}
  finally{downloadBtn.disabled=false;downloadBtn.textContent='↓ Download PDF';}
}
generateBtn.addEventListener('click',generate);copyBtn.addEventListener('click',copyNotes);downloadBtn.addEventListener('click',downloadPdf);
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();generate()}});
