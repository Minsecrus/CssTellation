import React, { useEffect, useRef, useState } from 'react';
import { cssColors, type ColorData } from '../data/colors';

// 配置参数
const SNAP_RADIUS = 20;
const CHART_PADDING = 60; // 内边距，保证四周有点位空隙，防止Tooltip切边

type InteractionState =
    | { type: 'idle' }
    | { type: 'hover', x: number, y: number, h: number, l: number, rgbHex: string }
    | { type: 'snapped', x: number, y: number, color: ColorData };

export const StarChart: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // 尺寸状态
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    // 交互状态 (鼠标)
    const [interaction, setInteraction] = useState<InteractionState>({ type: 'idle' });
    // 锁定状态 (点击选中的颜色)
    const [selectedColor, setSelectedColor] = useState<ColorData | null>(null);
    // 复制反馈状态
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

    // 1. 坐标转换核心函数 (增加 Padding 逻辑)
    // 将 Hue/Lightness 映射到带内边距的画布区域
    const getCoordinates = (h: number, l: number, w: number, height: number) => {
        const safeW = w - CHART_PADDING * 2;
        const safeH = height - CHART_PADDING * 2;

        return {
            x: CHART_PADDING + (h / 360) * safeW,
            y: CHART_PADDING + (1 - l / 100) * safeH
        };
    };

    // 2. 初始化尺寸监听
    useEffect(() => {
        if (!containerRef.current) return;
        const updateSize = () => {
            const { clientWidth, clientHeight } = containerRef.current!;
            setDimensions({ width: clientWidth, height: clientHeight });
        };
        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    // 3. 渲染画布
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || dimensions.width === 0) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = dimensions.width * dpr;
        canvas.height = dimensions.height * dpr;
        ctx.scale(dpr, dpr);
        canvas.style.width = `${dimensions.width}px`;
        canvas.style.height = `${dimensions.height}px`;

        ctx.clearRect(0, 0, dimensions.width, dimensions.height);

        cssColors.forEach(color => {
            // 使用带 Padding 的坐标计算
            const { x, y } = getCoordinates(color.hsl.h, color.hsl.l, dimensions.width, dimensions.height);

            ctx.beginPath();
            // 选中状态下的点可以画大一点
            const isSelected = selectedColor?.name === color.name;
            ctx.arc(x, y, isSelected ? 6 : 3, 0, Math.PI * 2);

            ctx.fillStyle = color.hex;
            ctx.fill();

            // 描边
            ctx.strokeStyle = isSelected ? '#fff' : 'rgba(255,255,255,0.3)';
            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.stroke();
        });
    }, [dimensions, selectedColor]);

    // 4. 交互逻辑
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        let closest: ColorData | null = null;
        let minDist = Infinity;

        // 寻找最近点
        for (const color of cssColors) {
            const { x, y } = getCoordinates(color.hsl.h, color.hsl.l, dimensions.width, dimensions.height);
            const dist = Math.sqrt((mx - x) ** 2 + (my - y) ** 2);
            if (dist < minDist) {
                minDist = dist;
                closest = color;
            }
        }

        if (closest && minDist <= SNAP_RADIUS) {
            const { x, y } = getCoordinates(closest.hsl.h, closest.hsl.l, dimensions.width, dimensions.height);
            setInteraction({ type: 'snapped', x, y, color: closest });
        } else {
            // Free Hover 反算 (这部分只是为了显示背景色，精度要求不高，简单逆推)
            // 注意：这里反算不考虑 Padding，让鼠标在边缘也能出颜色
            const h = (mx / dimensions.width) * 360;
            const l = (1 - my / dimensions.height) * 100;
            setInteraction({ type: 'hover', x: mx, y: my, h, l, rgbHex: '#000' }); // Hex计算略繁琐，这里暂略，主要用snapped
        }
    };

    // 点击锁定颜色
    const handleClick = () => {
        if (interaction.type === 'snapped') {
            setSelectedColor(interaction.color);
            setCopyStatus('idle'); // 重置复制状态
        } else {
            // 如果点击空白处，可以选择取消选择，或者保持不变，这里选择保持不变
        }
    };

    // 复制功能
    const handleCopy = () => {
        if (!selectedColor) return;
        const json = JSON.stringify(selectedColor, null, 2);
        navigator.clipboard.writeText(json).then(() => {
            setCopyStatus('copied');
            setTimeout(() => setCopyStatus('idle'), 2000);
        });
    };

    return (
        <div className="flex flex-col h-screen w-screen bg-slate-950 font-mono text-white overflow-hidden">

            {/* --- 上部分：星图区域 (90vh) --- */}
            <div
                ref={containerRef}
                className="relative flex-1 w-full cursor-crosshair overflow-hidden"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setInteraction({ type: 'idle' })}
                onClick={handleClick}
            >
                {/* 背景光晕 (全区域) */}
                <div
                    className="absolute inset-0 opacity-30 pointer-events-none"
                    style={{
                        background: `
              radial-gradient(circle at 50% 50%, rgba(255,255,255,0.1) 0%, transparent 60%),
              linear-gradient(to bottom, white 0%, transparent 50%, black 100%),
              linear-gradient(to right, red, orange, yellow, green, cyan, blue, violet, red)
            `
                    }}
                />

                {/* Canvas 层 */}
                <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

                {/* 鼠标交互层 (Tooltip) */}
                {interaction.type === 'snapped' && (
                    <div
                        className="absolute z-10 pointer-events-none transition-transform duration-75 will-change-transform"
                        style={{ transform: `translate3d(${interaction.x}px, ${interaction.y}px, 0)` }}
                    >
                        {/* 选中光圈 */}
                        <div className="w-6 h-6 -ml-3 -mt-3 rounded-full border border-white shadow-[0_0_10px_rgba(255,255,255,0.5)] animate-pulse" />

                        {/* Tooltip 信息 */}
                        {/* 替换原来的 Tooltip div */}
                        <div
                            className={`
    absolute top-4 left-4 p-2 rounded text-xs whitespace-nowrap backdrop-blur-md shadow-xl border
    ${interaction.color.hsl.l < 50
                                    ? 'bg-white/95 border-slate-200'  // 颜色暗 -> 白背景
                                    : 'bg-slate-900/90 border-white/10' // 颜色亮 -> 黑背景
                                }
  `}
                        >
                            <span className="font-bold" style={{ color: interaction.color.hex }}>
                                {interaction.color.name}
                            </span>

                            {/* 下面这行稍微改一下颜色逻辑，让它在白背景下也能看清 */}
                            <span className={`ml-2 ${interaction.color.hsl.l < 50 ? 'text-slate-600' : 'opacity-60'}`}>
                                Click to Lock
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* --- 下部分：数据控制台 (10vh) --- */}
            <div className="h-[10vh] min-h-[80px] bg-slate-900 border-t border-white/10 flex items-center px-6 gap-6 relative z-20 shadow-2xl">
                {selectedColor ? (
                    <>
                        {/* 颜色预览块 */}
                        <div
                            className="w-16 h-16 rounded-lg shadow-inner border border-white/10 shrink-0 transition-colors duration-300"
                            style={{ backgroundColor: selectedColor.hex }}
                        />

                        {/* 文本信息 */}
                        <div className="flex flex-col justify-center gap-1 flex-1 overflow-hidden">
                            <div className="flex items-baseline gap-3">
                                <h2 className="text-xl font-bold tracking-wide text-white">
                                    {selectedColor.name}
                                </h2>
                                <span className="text-sm opacity-70 font-mono">{selectedColor.hex}</span>
                            </div>
                            <div className="text-xs opacity-60 font-mono flex gap-4">
                                <span>rgb({selectedColor.rgb.r}, {selectedColor.rgb.g}, {selectedColor.rgb.b})</span>
                                <span>hsl({selectedColor.hsl.h}, {selectedColor.hsl.s}%, {selectedColor.hsl.l}%)</span>
                            </div>
                        </div>

                        {/* 操作按钮 */}
                        <div className="flex items-center gap-4">
                            <div className="hidden md:block text-[10px] text-right opacity-30 leading-tight">
                                JSON DATA<br />READY
                            </div>
                            <button
                                onClick={handleCopy}
                                className={`
                  px-4 py-2 rounded font-bold text-sm transition-all active:scale-95
                  ${copyStatus === 'copied'
                                        ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
                                    }
                `}
                            >
                                {copyStatus === 'copied' ? 'COPIED!' : 'COPY JSON'}
                            </button>
                        </div>
                    </>
                ) : (
                    /* 空状态提示 */
                    <div className="w-full flex items-center justify-center opacity-50 gap-2">
                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        <span className="text-sm tracking-widest uppercase">Select a star to analyze data</span>
                    </div>
                )}
            </div>

        </div>
    );
};