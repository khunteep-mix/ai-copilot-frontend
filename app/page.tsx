"use client";

import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string>(""); 
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const [persona, setPersona] = useState<string>("secretary"); 
  const [isContextLoaded, setIsContextLoaded] = useState(false); 
  const [fileName, setFileName] = useState<string>("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null); 
  
  const chunkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRecordingRef = useRef<boolean>(false);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("https://my-ai-backend-be42.onrender.com/api/upload/context", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (data.status === "success") {
        setIsContextLoaded(true);
      } else {
        alert("Upload error");
      }
    } catch (error) {
      console.error("Upload error:", error);
    }
  };

  const startRecording = async () => {
    try {
      setSummary(""); 
      setTranscripts([]); 
      
      await fetch("https://my-ai-backend-be42.onrender.com/api/meeting/reset", { method: "POST" });
      
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        alert("🚨 อย่าลืมติ๊กเลือก 'แชร์เสียง (Share audio)' ตรงมุมล่างซ้ายก่อนกดแชร์หน้าจอนะครับ!");
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const audioStream = new MediaStream([audioTrack]);
      streamRef.current = audioStream;
      setIsRecording(true);
      isRecordingRef.current = true;

      audioTrack.onended = () => stopRecording();

      let currentRecorder: MediaRecorder | null = null;

      const startNewChunk = () => {
        if (!isRecordingRef.current || !streamRef.current) return;

        const recorder = new MediaRecorder(streamRef.current, { mimeType: "audio/webm" });
        currentRecorder = recorder;
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = async (e) => {
          if (e.data && e.data.size > 1000) {
            const formData = new FormData();
            formData.append("file", e.data, "chunk.webm");
            formData.append("persona", persona); 
            
            try {
              const response = await fetch("https://my-ai-backend-be42.onrender.com/api/audio/chunk", {
                method: "POST",
                body: formData,
              });
              const data = await response.json();
              if (data.status === "success" && data.text) {
                setTranscripts((prev) => [...prev, data.text]);
              }
            } catch (error) {
              console.error("Backend connection error:", error);
            }
          }
        };

        recorder.start();
      };

      startNewChunk();

      chunkIntervalRef.current = setInterval(() => {
        if (currentRecorder && currentRecorder.state === "recording") {
          currentRecorder.stop();
          startNewChunk(); 
        }
      }, 8000);

    } catch (error) {
      console.error("Recording error:", error);
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    isRecordingRef.current = false;
    setIsSummarizing(true); 

    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    await new Promise((resolve) => setTimeout(resolve, 1200));

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    setIsContextLoaded(false); 
    setFileName("");
    
    try {
      const response = await fetch(`https://my-ai-backend-be42.onrender.com/api/meeting/summarize?persona=${persona}`, {
        method: "POST",
      });
      const data = await response.json();
      if (data.status === "success") {
        setSummary(data.summary);
      } else {
        setSummary("⚠️ " + data.message);
      }
    } catch (error) {
      setSummary("❌ Failed to generate report.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(summary);
    alert("📋 Copied successfully!");
  };

  const downloadSummary = () => {
    const element = document.createElement("a");
    const file = new Blob([summary], { type: "text/plain;charset=utf-8" });
    element.href = URL.createObjectURL(file);
    element.download = `Summary_${persona}_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const downloadTranscript = () => {
    if (transcripts.length === 0) {
      alert("ไม่มีประวัติการสนทนาให้ดาวน์โหลดครับ");
      return;
    }
    const fullTranscript = transcripts.join("\n\n");
    const element = document.createElement("a");
    const file = new Blob([fullTranscript], { type: "text/plain;charset=utf-8" });
    element.href = URL.createObjectURL(file);
    element.download = `Transcript_RealTime_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-start py-12 px-6 bg-[#090b11] text-slate-100 font-sans overflow-x-hidden antialiased">
      <div className="absolute top-[-10%] left-[20%] w-[600px] h-[600px] bg-gradient-to-br from-indigo-600/10 to-purple-600/0 rounded-full blur-[140px] pointer-events-none"></div>

      {/* Brand Header */}
      <div className="w-full max-w-5xl flex items-center justify-between mb-16 z-10 border-b border-slate-800/60 pb-5">
        <div className="flex items-center space-x-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
          </div>
          <span className="text-xl font-bold tracking-tight">AURA <span className="font-light text-slate-400">COPILOT</span></span>
        </div>
      </div>

      <div className="w-full max-w-5xl z-10 text-center">
        <h2 className="text-4xl font-extrabold tracking-tight text-white mb-2">Intelligence Dashboard</h2>
        <p className="text-slate-400 text-sm max-w-xl mx-auto mb-12 font-light">ถอดความเรียลไทม์พร้อมระบบวิเคราะห์อัจฉริยะตามโหมดการทำงาน</p>

        {/* Dashboard Settings */}
        {!isRecording && !isSummarizing && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12 max-w-4xl mx-auto text-left">
            <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">1. เลือกโหมดการทำงาน</label>
              <div className="relative">
                <select 
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none appearance-none cursor-pointer"
                >
                  <option value="secretary">📋 โหมดเลขามือโปร (จดบันทึก + AI ช่วยตอบคำถาม/งาน)</option>
                  <option value="podcast">🎙️ โหมด Podcast (ซับไตเติ้ลเรียบง่าย ไหลลื่น ไม่มี AI แทรกกวนใจ)</option>
                  <option value="interview">🎯 โหมดสัมภาษณ์ (วิเคราะห์พร้อมไกด์คำตอบเทพ)</option>
                  <option value="standard">🌐 โหมดมาตรฐาน (กุนซือสารพัดประโยชน์)</option>
                  <option value="student">🎓 โหมดนักเรียน/นักศึกษา (เน้นถอดความบทเรียน)</option>
                  <option value="business">👔 โหมดนักธุรกิจ (วิเคราะห์กลยุทธ์)</option>
                  <option value="sales">💰 โหมดนักขายระดับโลก (ป้อนดีลและสคริปต์ปิดการขาย)</option>
                  <option value="tech">🛠️ โหมด Tech Guru (ช่วยแก้บั๊กและปัญหาเทคนิค)</option>
                  <option value="diplomat">🕊️ โหมดนักการทูต (ลดความขัดแย้ง ประนีประนอม)</option>
                </select>
              </div>
            </div>

            <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">2. เอกสารอ้างอิง (RAG)</label>
              <input type="file" accept=".pdf,.txt" onChange={handleFileUpload} className="hidden" id="file-upload" />
              <label htmlFor="file-upload" className={`w-full text-center px-4 py-3 rounded-xl font-semibold text-sm cursor-pointer border-2 border-dashed flex items-center justify-center ${isContextLoaded ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-slate-950/60 border-slate-800 text-slate-400'}`}>
                {isContextLoaded ? `✓ อัปโหลดสำเร็จ: ${fileName.substring(0, 15)}...` : "+ เพิ่มบริบทความรู้ส่วนตัว (.pdf, .txt)"}
              </label>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="mb-12">
          {isRecording ? (
            <button onClick={stopRecording} className="px-10 py-4 bg-gradient-to-r from-red-600 to-pink-600 text-white font-bold rounded-full text-sm shadow-xl">
              ⏹️ TERMINATE & GENERATE REPORT
            </button>
          ) : isSummarizing ? (
            <div className="text-indigo-400 text-xs font-bold uppercase animate-pulse">กำลังปรุงสรุปผลการประชุมระดับผู้บริหาร...</div>
          ) : (
            <button onClick={startRecording} className="px-12 py-5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white font-bold rounded-full text-sm shadow-lg tracking-wider">
              🚀 LAUNCH LIVE COGNITIVE STREAM
            </button>
          )}
        </div>

        {/* Real-time Monitor Box */}
        {(transcripts.length > 0 || isRecording) && !summary && (
          <div className="text-left bg-slate-950/80 p-6 rounded-2xl border border-slate-800 h-[400px] overflow-y-auto mb-12 max-w-4xl mx-auto flex flex-col">
            <div className="sticky top-0 bg-slate-950 pb-3 mb-4 border-b border-slate-900 flex justify-between items-center text-xs text-slate-400 font-bold tracking-widest">
              <span>🔴 LIVE DIALOGUE MONITOR</span>
              <span className="bg-slate-900 px-2 py-1 rounded">MODE: {persona.toUpperCase()}</span>
            </div>
            <div className="flex flex-col space-y-3">
              {transcripts.length === 0 ? (
                <div className="text-slate-600 text-sm text-center py-24 italic">กำลังรอรับสัญญาณเสียงเข้าระบบ... ข้อความจะแสดงขึ้นที่นี่ทุก 8 วินาที</div>
              ) : (
                transcripts.map((text, index) => (
                  <div key={index} className="text-slate-200 text-sm leading-relaxed bg-slate-900/50 p-4 rounded-xl border border-slate-900 border-l-2 border-l-indigo-500 whitespace-pre-wrap">
                    {text}
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        )}

        {/* Final Document Presentation */}
        {summary && (
          <div className="text-left bg-slate-900/60 p-8 rounded-2xl border border-slate-800 max-w-4xl mx-auto">
            <h2 className="text-lg font-bold text-white mb-4 border-b border-slate-800 pb-3">📄 MEETING EXECUTIVE REPORT ({persona.toUpperCase()})</h2>
            <div className="text-slate-300 whitespace-pre-wrap leading-relaxed text-sm bg-slate-950/60 p-6 rounded-xl mb-6 shadow-inner">{summary}</div>
            <div className="flex space-x-4">
              <button onClick={copyToClipboard} className="flex-1 px-4 py-3 bg-slate-950 text-slate-400 font-bold text-xs rounded-xl border border-slate-800 hover:text-white transition-all">📋 COPY TO CLIPBOARD</button>
              <button onClick={downloadSummary} className="flex-1 px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold text-xs rounded-xl shadow-md">💾 DOWNLOAD TEXT FILE</button>
              <button onClick={downloadTranscript} className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-xs rounded-xl shadow-md">💬 DOWNLOAD TRANSCRIPT</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}