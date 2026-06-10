import React, { useEffect, useState, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useEEGStore } from '../store/eeg';
import { EEGData, BandPower, BrainState, CorrelationData } from '../types';
import axios from 'axios';

const CHANNEL_NAMES: Record<string, string> = {
  Fp1: '左前额', Fp2: '右前额', F3: '左额', F4: '右额',
  C3: '左中央', C4: '右中央', P3: '左顶', P4: '右顶',
  O1: '左枕', O2: '右枕'
};

const ALL_CHANNELS = ['Fp1', 'Fp2', 'F3', 'F4', 'C3', 'C4', 'P3', 'P4', 'O1', 'O2'];
const SAMPLE_RATE = 256;

const generateMockEEG = (durationSec: number = 3.0): EEGData => {
  const length = Math.floor(SAMPLE_RATE * durationSec);
  const time: number[] = [];
  const data: Record<string, number[]> = {};
  for (let i = 0; i < length; i++) {
    time.push(i / SAMPLE_RATE);
  }
  for (const ch of ALL_CHANNELS) {
    const sig: number[] = [];
    const alphaFreq = 8 + Math.random() * 4;
    const betaFreq = 15 + Math.random() * 10;
    for (let i = 0; i < length; i++) {
      const t = i / SAMPLE_RATE;
      const value = 0.5 * Math.sin(2 * Math.PI * alphaFreq * t) +
                    0.3 * Math.sin(2 * Math.PI * betaFreq * t) +
                    0.2 * (Math.random() * 2 - 1);
      sig.push(value);
    }
    data[ch] = sig;
  }
  return { channels: ALL_CHANNELS, sample_rate: SAMPLE_RATE, data, time, duration: durationSec };
};

const computeBandPower = (): BandPower => {
  const total = 10 + Math.random() * 5;
  return {
    delta: total * (0.2 + Math.random() * 0.1),
    theta: total * (0.15 + Math.random() * 0.1),
    alpha: total * (0.25 + Math.random() * 0.15),
    beta: total * (0.3 + Math.random() * 0.15),
    gamma: total * (0.1 + Math.random() * 0.05),
  };
};

const computeBrainState = (bands: BandPower): BrainState => {
  const total = bands.delta + bands.theta + bands.alpha + bands.beta + bands.gamma + 1e-10;
  const betaRel = bands.beta / total;
  const alphaRel = bands.alpha / total;
  const thetaRel = bands.theta / total;
  const focus = Math.min(100, Math.max(0, betaRel * 300 + (Math.random() - 0.5) * 10));
  const relaxation = Math.min(100, Math.max(0, alphaRel * 300 + (Math.random() - 0.5) * 10));
  const fatigue = Math.min(100, Math.max(0, thetaRel * 300 + (Math.random() - 0.5) * 10));
  const scores = { focused: focus, relaxed: relaxation, fatigued: fatigue };
  const maxScore = Math.max(...Object.values(scores));
  let status: 'focused' | 'relaxed' | 'fatigued' | 'neutral' = 'neutral';
  let statusLabel = '平稳';
  let statusColor = '#757575';
  if (maxScore >= 50) {
    const maxKey = Object.keys(scores).find(k => scores[k as keyof typeof scores] === maxScore) as keyof typeof scores;
    status = maxKey;
    if (status === 'focused') { statusLabel = '专注'; statusColor = '#1976d2'; }
    else if (status === 'relaxed') { statusLabel = '放松'; statusColor = '#388e3c'; }
    else { statusLabel = '疲劳'; statusColor = '#d32f2f'; }
  }
  return {
    focus: Math.round(focus * 10) / 10,
    relaxation: Math.round(relaxation * 10) / 10,
    fatigue: Math.round(fatigue * 10) / 10,
    status,
    statusLabel,
    statusColor,
    timestamp: Date.now(),
  };
};

const computeCorrelation = (targetChannel: string, eegData: EEGData): CorrelationData => {
  const targetData = eegData.data[targetChannel];
  const correlations = ALL_CHANNELS.map(ch => {
    if (ch === targetChannel) {
      return { channel: ch, targetChannel, correlation: 1.0, coherence: 1.0 };
    }
    const chData = eegData.data[ch];
    let sumXY = 0, sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0;
    const n = targetData.length;
    for (let i = 0; i < n; i++) {
      sumXY += targetData[i] * chData[i];
      sumX += targetData[i];
      sumY += chData[i];
      sumX2 += targetData[i] * targetData[i];
      sumY2 += chData[i] * chData[i];
    }
    const corr = (n * sumXY - sumX * sumY) /
      Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    return {
      channel: ch,
      targetChannel,
      correlation: Math.round(corr * 10000) / 10000,
      coherence: Math.round((0.3 + Math.random() * 0.5) * 10000) / 10000,
    };
  });
  return { targetChannel, correlations };
};

export const WaveformChart: React.FC = () => {
  const {
    eegData, selectedChannel, setEEGData, setBandPower, setBrainState, setCorrelationData,
    isRecording, addRecordingFrame, playbackMode,
  } = useEEGStore();
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const [xZoomStart, setXZoomStart] = useState<number>(0);
  const [xZoomEnd, setXZoomEnd] = useState<number>(1);
  const [yZoomMin, setYZoomMin] = useState<number | null>(null);
  const [yZoomMax, setYZoomMax] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; xStart: number; xEnd: number; yMin: number | null; yMax: number | null } | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  const fetchEEG = async () => {
    const state = useEEGStore.getState();
    if (state.playbackMode) return;
    setLoading(true);
    let eeg: EEGData, bands: BandPower, brainState: BrainState, correlation: CorrelationData;
    try {
      const { data } = await axios.get(`/api/eeg/sample/${state.selectedChannel}?duration=3`);
      eeg = data.eeg;
      bands = data.bands;
      brainState = data.brainState;
      correlation = data.correlation;
    } catch {
      eeg = generateMockEEG(3);
      bands = computeBandPower();
      brainState = computeBrainState(bands);
      correlation = computeCorrelation(state.selectedChannel, eeg);
    }
    state.setEEGData(eeg);
    state.setBandPower(bands);
    state.setBrainState(brainState);
    state.setCorrelationData(correlation);
    if (state.isRecording) {
      state.addRecordingFrame(eeg, bands, brainState);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (playbackMode) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    fetchEEG();
    intervalRef.current = window.setInterval(fetchEEG, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [selectedChannel, playbackMode]);

  const rawValues = eegData?.data[selectedChannel] || [];
  const rawTimes = eegData?.time || [];
  const totalPoints = rawValues.length;

  const startIdx = Math.floor(xZoomStart * totalPoints);
  const endIdx = Math.ceil(xZoomEnd * totalPoints);
  const visibleValues = rawValues.slice(startIdx, endIdx);
  const visibleTimes = rawTimes.slice(startIdx, endIdx);

  const chartData = visibleValues.map((v: number, i: number) => ({
    t: visibleTimes[i]?.toFixed(3), value: v.toFixed(4)
  }));

  const autoYMin = visibleValues.length > 0 ? Math.min(...visibleValues) : 0;
  const autoYMax = visibleValues.length > 0 ? Math.max(...visibleValues) : 0;
  const yMargin = (autoYMax - autoYMin) * 0.1 || 0.1;
  const yDomain: [number | 'auto', number | 'auto'] = [
    yZoomMin !== null ? yZoomMin : 'auto',
    yZoomMax !== null ? yZoomMax : 'auto'
  ];

  const channelName = CHANNEL_NAMES[selectedChannel] || selectedChannel;

  const resetZoom = () => {
    setXZoomStart(0);
    setXZoomEnd(1);
    setYZoomMin(null);
    setYZoomMax(null);
  };

  const zoomX = (factor: number, center: number = 0.5) => {
    const centerX = xZoomStart + (xZoomEnd - xZoomStart) * center;
    const newRange = Math.max(0.02, (xZoomEnd - xZoomStart) * factor);
    let newStart = centerX - newRange * center;
    let newEnd = centerX + newRange * (1 - center);
    if (newStart < 0) { newStart = 0; newEnd = newRange; }
    if (newEnd > 1) { newEnd = 1; newStart = 1 - newRange; }
    setXZoomStart(newStart);
    setXZoomEnd(newEnd);
  };

  const zoomY = (factor: number, center: number = 0.5) => {
    const curMin = yZoomMin !== null ? yZoomMin : autoYMin - yMargin;
    const curMax = yZoomMax !== null ? yZoomMax : autoYMax + yMargin;
    const range = curMax - curMin;
    const centerY = curMin + range * center;
    const newRange = range * factor;
    setYZoomMin(centerY - newRange * center);
    setYZoomMax(centerY + newRange * (1 - center));
  };

  const panX = (delta: number) => {
    const range = xZoomEnd - xZoomStart;
    let newStart = xZoomStart + delta * range;
    let newEnd = xZoomEnd + delta * range;
    if (newStart < 0) { newStart = 0; newEnd = range; }
    if (newEnd > 1) { newEnd = 1; newStart = 1 - range; }
    setXZoomStart(newStart);
    setXZoomEnd(newEnd);
  };

  const panY = (delta: number) => {
    const curMin = yZoomMin !== null ? yZoomMin : autoYMin - yMargin;
    const curMax = yZoomMax !== null ? yZoomMax : autoYMax + yMargin;
    const range = curMax - curMin;
    setYZoomMin(curMin + delta * range);
    setYZoomMax(curMax + delta * range);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = chartContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = 1 - (e.clientY - rect.top) / rect.height;
    const factor = e.deltaY > 0 ? 1.25 : 0.8;
    zoomX(factor, Math.max(0, Math.min(1, xRatio)));
    zoomY(factor, Math.max(0, Math.min(1, yRatio)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      xStart: xZoomStart,
      xEnd: xZoomEnd,
      yMin: yZoomMin,
      yMax: yZoomMax,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStartRef.current) return;
    const rect = chartContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const start = dragStartRef.current;
    const dx = (start.x - e.clientX) / rect.width;
    const dy = (e.clientY - start.y) / rect.height;
    const xRange = start.xEnd - start.xStart;
    let newStart = start.xStart + dx * xRange;
    let newEnd = start.xEnd + dx * xRange;
    if (newStart < 0) { newStart = 0; newEnd = xRange; }
    if (newEnd > 1) { newEnd = 1; newStart = 1 - xRange; }
    setXZoomStart(newStart);
    setXZoomEnd(newEnd);

    const curMin = start.yMin !== null ? start.yMin : autoYMin - yMargin;
    const curMax = start.yMax !== null ? start.yMax : autoYMax + yMargin;
    const yRange = curMax - curMin;
    setYZoomMin(curMin + dy * yRange);
    setYZoomMax(curMax + dy * yRange);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => { setIsDragging(false); dragStartRef.current = null; };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  useEffect(() => {
    resetZoom();
  }, [selectedChannel]);

  const zoomPercent = Math.round(1 / (xZoomEnd - xZoomStart));

  const btnStyle: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: '12px',
    border: '1px solid #d0d7de',
    borderRadius: '6px',
    background: '#f8fafc',
    cursor: 'pointer',
    color: '#374151',
    transition: 'all 0.15s',
    userSelect: 'none',
  };
  const btnHoverStyle: React.CSSProperties = { ...btnStyle, background: '#eef2ff', borderColor: '#1565c0', color: '#1565c0' };

  return (
    <div style={{ padding: '16px', background: '#fff', borderRadius: '12px', margin: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '20px' }}>📈</span>
        <span>{selectedChannel}</span>
        <span style={{ fontSize: '13px', color: '#666', fontWeight: 400 }}>{channelName} · 波形图</span>
        {isRecording && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#d32f2f', fontWeight: 500 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#d32f2f', animation: 'pulse 1s infinite' }} />
            录制中
          </span>
        )}
        {playbackMode && (
          <span style={{ fontSize: '12px', color: '#1565c0', fontWeight: 500 }}>⏮ 回放模式</span>
        )}
        {loading && !playbackMode && <span style={{ fontSize: '12px', color: '#999' }}>刷新中...</span>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: '#6b7280', marginRight: '4px' }}>缩放 {zoomPercent}x</span>
        <button
          style={btnStyle}
          onClick={() => { zoomX(0.5); zoomY(0.5); }}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, btnHoverStyle)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, btnStyle)}
          title="放大"
        >🔍+</button>
        <button
          style={btnStyle}
          onClick={() => { zoomX(2); zoomY(2); }}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, btnHoverStyle)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, btnStyle)}
          title="缩小"
        >🔍−</button>
        <button
          style={btnStyle}
          onClick={() => panX(-0.2)}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, btnHoverStyle)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, btnStyle)}
          title="左移"
        >◀</button>
        <button
          style={btnStyle}
          onClick={() => panX(0.2)}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, btnHoverStyle)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, btnStyle)}
          title="右移"
        >▶</button>
        <button
          style={btnStyle}
          onClick={() => panY(0.2)}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, btnHoverStyle)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, btnStyle)}
          title="上移"
        >▲</button>
        <button
          style={btnStyle}
          onClick={() => panY(-0.2)}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, btnHoverStyle)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, btnStyle)}
          title="下移"
        >▼</button>
        <button
          style={{ ...btnStyle, background: '#1565c0', color: '#fff', borderColor: '#1565c0' }}
          onClick={resetZoom}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#0d47a1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#1565c0'; }}
          title="重置视图"
        >⟲ 重置</button>
      </h3>
      <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '8px' }}>
        💡 鼠标滚轮缩放 · 拖拽平移 · 可聚焦查看局部波形
      </div>
      <div
        ref={chartContainerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
      >
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData}>
            <XAxis dataKey="t" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} domain={yDomain} allowDataOverflow={false} />
            <Tooltip
              formatter={(value: number) => [Number(value).toFixed(4), '幅值']}
              labelFormatter={(label) => `时间 ${label}s`}
            />
            <Line type="monotone" dataKey="value" stroke="#1565c0" dot={false} strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
