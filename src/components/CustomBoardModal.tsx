import { useEffect, useRef, useState } from 'react';
import type { PartDef, PortDef, PortType } from '../lib/wiring';
import { PORT_TYPE_COLOR, PORT_TYPE_NAME, uid } from '../lib/wiring';
import { oppositePairType, pairCustomPorts, prepareCustomImage } from '../lib/customBoard';
import { imageDisplaySize } from '../lib/imageSize';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

interface Props {
  onClose: () => void;
  onSave: (def: PartDef) => void;
}

const PORT_TYPES: PortType[] = ['pwr+', 'pwr-', 'canH', 'canL', 'signal', 'data'];

/** 上传器件图片 → 点击图片标记端口 → 保存为自定义板卡 */
export default function CustomBoardModal({ onClose, onSave }: Props) {
  const [name, setName] = useState('自定义板卡');
  const [imgData, setImgData] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [ports, setPorts] = useState<PortDef[]>([]);
  const [nextType, setNextType] = useState<PortType>('signal');
  const [productUrl, setProductUrl] = useState('');
  const [docsUrl, setDocsUrl] = useState('');
  const [imageError, setImageError] = useState('');
  const [loadingImage, setLoadingImage] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const uploadId = useRef(0);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return () => { uploadId.current += 1; };
  }, []);

  const onFile = async (file: File) => {
    const requestId = ++uploadId.current;
    setLoadingImage(true);
    setImageError('');
    try {
      const image = await prepareCustomImage(file);
      if (requestId !== uploadId.current) return;
      setImgData(image.data);
      setImgSize({ w: image.w, h: image.h });
      setPorts([]);
      setName(file.name.replace(/\.[^.]+$/, '') || '自定义板卡');
    } catch (error) {
      if (requestId === uploadId.current) setImageError(error instanceof Error ? error.message : '图片导入失败，请重试。');
    } finally {
      if (requestId === uploadId.current) setLoadingImage(false);
    }
  };

  const onImageClick = (e: React.MouseEvent) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    setPorts((ps) => [
      ...ps,
      { id: uid(), label: `P${ps.length + 1}`, x, y, type: nextType },
    ]);
  };

  const save = () => {
    if (!imgData || !imgSize || loadingImage) return;
    for (const value of [productUrl.trim(), docsUrl.trim()]) {
      if (!value) continue;
      try {
        if (!['http:', 'https:'].includes(new URL(value).protocol)) throw new Error();
      } catch {
        setImageError('产品页和文档链接须为有效的 http:// 或 https:// 地址。');
        return;
      }
    }
    onSave({
      id: uid(),
      name: name.trim() || '自定义板卡',
      category: '自定义',
      imgData,
      w: imgSize.w,
      h: imgSize.h,
      displayWidth: imageDisplaySize(imgSize.w, imgSize.h, 200).w,
      ports,
      custom: true,
      productUrl: productUrl.trim() || undefined,
      docsUrl: docsUrl.trim() || undefined,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="bg-white rounded-xl shadow-2xl w-[calc(100%-2rem)] sm:max-w-3xl max-h-[calc(100dvh-2rem)] flex flex-col gap-0 p-0"
        onOpenAutoFocus={() => { returnFocusRef.current = document.activeElement as HTMLElement | null; }}
        onCloseAutoFocus={(event) => { event.preventDefault(); returnFocusRef.current?.focus(); }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <DialogTitle className="font-semibold text-base text-slate-800">导入自定义器件</DialogTitle>
          <button onClick={onClose} aria-label="关闭自定义器件窗口" className="h-8 w-8 text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          <DialogDescription className="text-xs text-slate-500">导入图片后可标记端口，再保存到自定义元件库。图片自动缩小至 2048 像素以内并压缩。</DialogDescription>
          {imageError && <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{imageError}</div>}
          {loadingImage && <div role="status" className="text-sm text-sky-700">正在处理图片…</div>}
          {!imgData ? (
            <label className="relative block border-2 border-dashed border-slate-300 rounded-xl py-14 text-center cursor-pointer hover:border-sky-400 focus-within:border-sky-500 transition-colors">
              <div className="text-slate-500 text-sm">点击导入器件图片（PNG / JPG / WEBP）</div>
              <div className="mt-1 text-xs text-slate-400">文件不超过 10 MB，压缩后不超过 750 KB</div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label="选择器件图片"
                disabled={loadingImage}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void onFile(file);
                }}
              />
            </label>
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="border border-slate-300 rounded px-2 py-1 text-sm w-48"
                  placeholder="板卡名称"
                  aria-label="板卡名称"
                  maxLength={120}
                />
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  新端口类型：
                  {PORT_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setNextType(t)}
                      aria-pressed={nextType === t}
                      className={`px-2 py-0.5 rounded-full border text-[11px] ${
                        nextType === t ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-500'
                      }`}
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-1 align-middle"
                        style={{ background: PORT_TYPE_COLOR[t] }}
                      />
                      {PORT_TYPE_NAME[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={productUrl}
                  onChange={(event) => setProductUrl(event.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                  placeholder="商店/产品页链接（可选）"
                  aria-label="商店或产品页链接"
                  type="url"
                />
                <input
                  value={docsUrl}
                  onChange={(event) => setDocsUrl(event.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                  placeholder="供应商文档链接（可选）"
                  aria-label="供应商文档链接"
                  type="url"
                />
              </div>
              <div className="text-xs text-slate-400">在图片上点击即可放置端口；端口不是必填，下方列表可改名、改类型或删除。</div>
              <div className="border border-slate-200 rounded-lg bg-slate-50 overflow-auto max-h-72 flex justify-center">
                <div className="relative inline-block">
                  <img
                    ref={imgRef}
                    src={imgData}
                    alt="自定义器件：点击图片标记端口"
                    className="max-h-72 block cursor-crosshair select-none"
                    draggable={false}
                    onClick={onImageClick}
                  />
                  {ports.map((pt) => (
                    <div
                      key={pt.id}
                      className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%`, background: PORT_TYPE_COLOR[pt.type] }}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                {ports.map((pt, i) => (
                  <div key={pt.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: PORT_TYPE_COLOR[pt.type] }}
                    />
                    <input
                      value={pt.label}
                      aria-label={`端口 ${i + 1} 名称`}
                      maxLength={80}
                      onChange={(e) =>
                        setPorts((ps) => ps.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                      }
                      className="border border-slate-300 rounded px-1.5 py-0.5 w-32"
                    />
                    <select
                      value={pt.type}
                      aria-label={`端口 ${i + 1} 类型`}
                      onChange={(e) =>
                        setPorts((ps) =>
                          pairCustomPorts(ps, pt.id).map((x, j) => (j === i ? { ...x, type: e.target.value as PortType } : x)),
                        )
                      }
                      className="border border-slate-300 rounded px-1 py-0.5"
                    >
                      {PORT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {PORT_TYPE_NAME[t]}
                        </option>
                      ))}
                    </select>
                    {oppositePairType(pt.type) && (
                      <select
                        aria-label={`端口 ${i + 1} 配对端口`}
                        value={pt.pairId ?? ''}
                        onChange={(event) => setPorts((ps) => pairCustomPorts(ps, pt.id, event.target.value || undefined))}
                        className="max-w-40 rounded border border-slate-300 px-1 py-0.5"
                      >
                        <option value="">未指定配对</option>
                        {ports.filter((candidate) => candidate.type === oppositePairType(pt.type)).map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>配对：{candidate.label}</option>
                        ))}
                      </select>
                    )}
                    <span className="text-slate-400">
                      ({(pt.x * 100).toFixed(0)}%, {(pt.y * 100).toFixed(0)}%)
                    </span>
                    <button
                      className="text-slate-400 hover:text-red-500 ml-auto"
                      aria-label={`删除端口 ${pt.label}`}
                      onClick={() => setPorts((ps) => pairCustomPorts(ps, pt.id).filter((_, j) => j !== i))}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
              {ports.some((port) => oppositePairType(port.type)) && <p className="text-xs text-slate-500">将 CAN H/L 或电源正负极设为一对，可在画布上一并连接。每个端口只能有一个配对端口。</p>}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700">
            取消
          </button>
          <button
            onClick={save}
            disabled={!imgData || loadingImage}
            className="px-4 py-1.5 text-sm rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            保存到元件库
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
