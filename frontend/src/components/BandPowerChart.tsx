import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useEEGStore } from '../store/eeg';

const COLORS = ['#1565c0','#2e7d32','#f9a825','#e53935','#6a1b9a'];
const LABELS = ['Delta','Theta','Alpha','Beta','Gamma'];
const CHANNEL_NAMES: Record<string, string> = {
  Fp1: '左前额', Fp2: '右前额', F3: '左额', F4: '右额',
  C3: '左中央', C4: '右中央', P3: '左顶', P4: '右顶',
  O1: '左枕', O2: '右枕'
};

export const BandPowerChart: React.FC = () => {
  const { bandPower, selectedChannel, playbackMode } = useEEGStore();
  const channelName = CHANNEL_NAMES[selectedChannel] || selectedChannel;

  const [yZoomMin, setYZoomMin] = useState<number>(0);
  const [yZoomMax, setYZoomMax] = useState<number | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  const data = bandPower ? LABELS.map((label, i) => ({
    name: label,
    power: (bandPower as any)[label.toLowerCase()] || 0,
    color: COLORS[i]
  })) : [];

  const maxPower = data.length > 0 ? Math.max(...data.map(d => d.power)) : 10;
  const autoYMax = maxPower * 1.15;
  const currentYMax = yZoomMax !== null ? yZoomMax : autoYMax;

  const resetZoom = () => {
    setYZoomMin(0);
    setYZoomMax(null);
  };

  const zoomY = (factor: number, centerRatio: number = 0.5) => {
    const curMin = yZoomMin;
    const curMax = currentYMax;
    const range = curMax - curMin;
    const centerY = curMin + range * (1 - centerRatio);
    const newRange = range * factor;
    setYZoomMin(Math.max(0, centerY - newRange * (1 - centerRatio)));
    setYZoomMax(centerY + newRange * centerRatio);
  };

  const panY = (delta: number) => {
    const curMin = yZoomMin;
    const curMax = currentYMax;
    const range = curMax - curMin;
    const newMin = Math.max(0, curMin + delta * range);
    const newMax = newMin + range;
    setYZoomMin(newMin);
    setYZoomMax(newMax);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = chartContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const yRatio = 1 - (e.clientY - rect.top) / rect.height;
    const factor = e.deltaY > 0 ? 1.25 : 0.8;
    zoomY(factor, Math.max(0, Math.min(1, yRatio)));
  };

  useEffect(() => {
    resetZoom();
  }, [selectedChannel, bandPower]);

  const zoomPercent = Math.round(autoYMax / (currentYMax - yZoomMin));

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

  if (!bandPower) {
    return (
      <div style={{ padding: '16px', background: '#fff', borderRadius: '12px', margin: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '20px' }}>📊</span>
          <span>{selectedChannel}</span>
          <span style={{ fontSize: '13px', color: '#666', fontWeight: 400 }}>{channelName} · 频段能量</span>
          {playbackMode && <span style={{ fontSize: '12px', color: '#1565c0', fontWeight: 500 }}>⏮ 回放中</span>}
        </h3>
        <div style={{ color: '#999', padding: '40px 0', textAlign: 'center' }}>等待数据中...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', background: '#fff', borderRadius: '12px', margin: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '20px' }}>📊</span>
        <span>{selectedChannel}</span>
        <span style={{ fontSize: '13px', color: '#666', fontWeight: 400 }}>{channelName} · 频段能量</span>
        {playbackMode && <span style={{ fontSize: '12px', color: '#1565c0', fontWeight: 500 }}>⏮ 回放模式</span>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: '#6b7280', marginRight: '4px' }}>Y轴 {zoomPercent}x</span>
        <button
          style={btnStyle}
          onClick={() => zoomY(0.5)}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, btnHoverStyle)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, btnStyle)}
          title="放大Y轴"
        >🔍+</button>
        <button
          style={btnStyle}
          onClick={() => zoomY(2)}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, btnHoverStyle)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, btnStyle)}
          title="缩小Y轴"
        >🔍−</button>
        <button
          style={btnStyle}
          onClick={() => panY(0.2)}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, btnHoverStyle)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, btnStyle)}
          title="上移Y轴"
        >▲</button>
        <button
          style={btnStyle}
          onClick={() => panY(-0.2)}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, btnHoverStyle)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, btnStyle)}
          title="下移Y轴"
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
        💡 鼠标滚轮缩放Y轴 · 聚焦查看频段能量细节
      </div>
      <div
        ref={chartContainerRef}
        onWheel={handleWheel}
        style={{ userSelect: 'none' }}
      >
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} domain={[yZoomMin, currentYMax]} allowDataOverflow={false} />
            <Tooltip
              formatter={(value: number) => [value.toFixed(2), '能量值']}
              labelFormatter={(label) => `${label} 频段`}
            />
            <Bar dataKey="power" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
