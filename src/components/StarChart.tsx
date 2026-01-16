import React, { useEffect, useRef, useState } from 'react';
import { cssColors, type ColorData } from '../data/colors';

// 配置参数
const SNAP_RADIUS = 20;
const CHART_PADDING = 60; // 内边距，保证四周有点位空隙，防止Tooltip切边

// RGB 转 HSV
const rgbToHsv = (r: number, g: number, b: number) => {
    const rNorm = r / 255;
    const gNorm = g / 255;
    const bNorm = b / 255;

    const max = Math.max(rNorm, gNorm, bNorm);
    const min = Math.min(rNorm, gNorm, bNorm);
    const delta = max - min;

    let h = 0;
    let s = max === 0 ? 0 : (delta / max) * 100;
    let v = max * 100;

    if (delta !== 0) {
        if (max === rNorm) {
            h = ((gNorm - bNorm) / delta + (gNorm < bNorm ? 6 : 0)) * 60;
        } else if (max === gNorm) {
            h = ((bNorm - rNorm) / delta + 2) * 60;
        } else {
            h = ((rNorm - gNorm) / delta + 4) * 60;
        }
    }

    return { h: Math.round(h), s: Math.round(s), v: Math.round(v) };
};

// RGB 转 CMYK
const rgbToCmyk = (r: number, g: number, b: number) => {
    const rNorm = r / 255;
    const gNorm = g / 255;
    const bNorm = b / 255;

    const k = 1 - Math.max(rNorm, gNorm, bNorm);
    const c = k === 1 ? 0 : (1 - rNorm - k) / (1 - k);
    const m = k === 1 ? 0 : (1 - gNorm - k) / (1 - k);
    const y = k === 1 ? 0 : (1 - bNorm - k) / (1 - k);

    return {
        c: Math.round(c * 100),
        m: Math.round(m * 100),
        y: Math.round(y * 100),
        k: Math.round(k * 100)
    };
};

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
    const [copiedField, setCopiedField] = useState<string | null>(null);

    const [isInfoOpen, setIsInfoOpen] = useState(false);

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
            setCopiedField(null); // 重置复制状态
        } else {
            // 如果点击空白处，可以选择取消选择，或者保持不变，这里选择保持不变
        }
    };

    // 复制功能
    const handleCopy = (value: string, field: string) => {
        navigator.clipboard.writeText(value).then(() => {
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 2000);
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
                        </div>
                    </div>
                )}
            </div>

            {/* --- 下部分：数据控制台 (10vh) --- */}
            <div className="h-[10vh] min-h-[100px] bg-slate-900 border-t border-white/10 flex items-center px-6 justify-between relative z-20 shadow-2xl">

                <div className="flex-1 flex items-center gap-6 overflow-hidden mr-4">
                    {selectedColor ? (
                        <>
                            {/* 1. 颜色预览块 */}
                            <div
                                className="w-16 h-16 rounded-lg shadow-inner border border-white/10 shrink-0 transition-colors duration-300"
                                style={{ backgroundColor: selectedColor.hex }}
                            />

                            {/* 2. 文本信息详情 */}
                            <div className="flex flex-col justify-center flex-1 overflow-hidden">
                                {/* 标题 */}
                                <div className="flex items-baseline gap-2 mb-1">
                                    <h2 className="text-xl font-bold tracking-wide text-white truncate">
                                        {selectedColor.name}
                                    </h2>
                                </div>

                                {/* 数据行容器 */}
                                <div className="flex flex-col gap-0.5">

                                    {/* 第一行: Hex (带复制) */}
                                    <div className="flex items-center gap-2 group h-5">
                                        <span className="text-sm opacity-90 font-mono text-white">{selectedColor.hex}</span>
                                        <button
                                            onClick={() => handleCopy(selectedColor.hex, 'hex')}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 text-[9px] rounded bg-white/10 hover:bg-white/20 text-white border border-white/10 active:scale-95 leading-none"
                                        >
                                            {copiedField === 'hex' ? '✓' : 'COPY'}
                                        </button>
                                    </div>

                                    {/* 第二行: 紧凑的数值流 (RGB, HSL, HSV, CMYK) */}
                                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 items-center">

                                        {/* RGB */}
                                        <div className="flex items-center gap-1 group">
                                            <span className="text-[10px] opacity-70 font-mono">
                                                rgb({selectedColor.rgb.r}, {selectedColor.rgb.g}, {selectedColor.rgb.b})
                                            </span>
                                            <button
                                                onClick={() => handleCopy(`rgb(${selectedColor.rgb.r}, ${selectedColor.rgb.g}, ${selectedColor.rgb.b})`, 'rgb')}
                                                className="opacity-0 group-hover:opacity-100 transition-all px-1 py-0.5 text-[8px] rounded bg-white/10 hover:bg-white/20 text-white border border-white/10 active:scale-95 leading-none"
                                            >
                                                {copiedField === 'rgb' ? '✓' : 'CP'}
                                            </button>
                                        </div>

                                        {/* HSL */}
                                        <div className="flex items-center gap-1 group">
                                            <span className="text-[10px] opacity-70 font-mono">
                                                hsl({selectedColor.hsl.h}, {selectedColor.hsl.s}%, {selectedColor.hsl.l}%)
                                            </span>
                                            <button
                                                onClick={() => handleCopy(`hsl(${selectedColor.hsl.h}, ${selectedColor.hsl.s}%, ${selectedColor.hsl.l}%)`, 'hsl')}
                                                className="opacity-0 group-hover:opacity-100 transition-all px-1 py-0.5 text-[8px] rounded bg-white/10 hover:bg-white/20 text-white border border-white/10 active:scale-95 leading-none"
                                            >
                                                {copiedField === 'hsl' ? '✓' : 'CP'}
                                            </button>
                                        </div>

                                        {/* HSV (计算) */}
                                        {(() => {
                                            const hsv = rgbToHsv(selectedColor.rgb.r, selectedColor.rgb.g, selectedColor.rgb.b);
                                            return (
                                                <div className="flex items-center gap-1 group hidden xl:flex">
                                                    <span className="text-[10px] opacity-70 font-mono">
                                                        hsv({hsv.h}, {hsv.s}%, {hsv.v}%)
                                                    </span>
                                                    <button
                                                        onClick={() => handleCopy(`hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`, 'hsv')}
                                                        className="opacity-0 group-hover:opacity-100 transition-all px-1 py-0.5 text-[8px] rounded bg-white/10 hover:bg-white/20 text-white border border-white/10 active:scale-95 leading-none"
                                                    >
                                                        {copiedField === 'hsv' ? '✓' : 'CP'}
                                                    </button>
                                                </div>
                                            );
                                        })()}

                                        {/* CMYK (计算) */}
                                        {(() => {
                                            const cmyk = rgbToCmyk(selectedColor.rgb.r, selectedColor.rgb.g, selectedColor.rgb.b);
                                            return (
                                                <div className="flex items-center gap-1 group hidden 2xl:flex">
                                                    <span className="text-[10px] opacity-70 font-mono">
                                                        cmyk({cmyk.c}%, {cmyk.m}%, {cmyk.y}%, {cmyk.k}%)
                                                    </span>
                                                    <button
                                                        onClick={() => handleCopy(`cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`, 'cmyk')}
                                                        className="opacity-0 group-hover:opacity-100 transition-all px-1 py-0.5 text-[8px] rounded bg-white/10 hover:bg-white/20 text-white border border-white/10 active:scale-95 leading-none"
                                                    >
                                                        {copiedField === 'cmyk' ? '✓' : 'CP'}
                                                    </button>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        /* 空状态提示 (现在位于 Flex 左侧) */
                        <div className="flex justify-center items-center opacity-50 gap-3 w-full">
                            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                            <span className="text-sm tracking-widest uppercase">Select a star to analyze data</span>
                        </div>
                    )}
                </div>

                {/* ======================= */}
                {/* 右侧区域：操作按钮 (固定) */}
                {/* ======================= */}
                <div className="flex items-center gap-4 shrink-0">

                    {/* JSON Copy 按钮 (只有选中时才出现) */}
                    {selectedColor && (
                        <>
                            <div className="hidden md:block text-[10px] text-right opacity-50 leading-tight font-mono">
                                JSON OBJECT<br />READY
                            </div>
                            <button
                                onClick={() => handleCopy(JSON.stringify(selectedColor, null, 2), 'json')}
                                className={`
                  px-4 py-2 rounded font-bold text-sm transition-all active:scale-95 whitespace-nowrap
                  ${copiedField === 'json'
                                        ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
                                    }
                `}
                            >
                                {copiedField === 'json' ? 'COPIED!' : 'COPY JSON'}
                            </button>
                            {/* 分割线 */}
                            <div className="w-px h-8 bg-white/10 mx-2" />
                        </>
                    )}

                    {/* Info 按钮 (永远存在！！) */}
                    <button
                        onClick={() => setIsInfoOpen(true)}
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors border border-white/5"
                        aria-label="About"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                    </button>
                </div>
            </div>
            {/* 👇 全屏弹窗 Modal */}
            {isInfoOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                    onClick={() => setIsInfoOpen(false)} // 点击背景关闭
                >
                    {/* 弹窗主体 */}
                    <div
                        className="bg-slate-900 border border-white/20 rounded-xl shadow-2xl max-w-lg w-full p-8 relative overflow-hidden"
                        onClick={(e) => e.stopPropagation()} // 防止点击内容区域关闭弹窗
                    >
                        {/* 装饰光晕 */}
                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500/20 blur-[50px] rounded-full pointer-events-none" />

                        {/* 标题 */}
                        <h2 className="text-2xl font-bold text-white mb-2">About CssTellation</h2>
                        <div className="h-1 w-10 bg-blue-500 rounded mb-6" />

                        {/* 内容区域 (预留位置) */}
                        <div className="space-y-4 text-slate-300 text-sm leading-relaxed">
                            <p>
                                A visual exploration of CSS Named Colors. Designed to help developers and designers discover the beauty hidden in standard web specifications.
                            </p>

                            {/* 项目信息列表 */}
                            <div className="py-4 border-t border-white/10 border-b space-y-3">
                                <div className="flex justify-between">
                                    <span className="opacity-60">Version</span>
                                    <span className="font-mono text-white">1.0.0</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="opacity-60">Stack</span>
                                    <span className="font-mono text-white">React + TypeScript + Tailwind</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="opacity-60">GitHub</span>
                                    <a
                                        href="https://github.com/Minsecrus/CssTellation"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                                    >
                                        https://github.com/Minsecrus/CssTellation
                                    </a>
                                </div>
                            </div>

                            <p className="opacity-70 text-xs mt-4">
                                Data source: CSS Color Module Level 4. <br />
                                Built with precision and ❤️.
                            </p>
                        </div>

                        {/* 关闭按钮 (右上角 X) */}
                        <button
                            onClick={() => setIsInfoOpen(false)}
                            className="absolute top-4 right-4 p-2 text-white/50 hover:text-white transition-colors"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>

                    </div>
                </div>
            )}
        </div>
    );
};