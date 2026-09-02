import { useRef, useState } from 'react';
import type { PartDef, PortDef, PortType } from '../lib/wiring';
import { PORT_TYPE_COLOR, PORT_TYPE_NAME, uid } from '../lib/wiring';

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
  const imgRef = useRef<HTMLImageElement>(null);

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as string;
      const img = new Image();
      img.onload = () => {
        setImgData(data);
        setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
        setPorts([]);
        setName(file.name.replace(/\.[^.]+$/, '') || '自定义板卡');
      };
      img.src = data;
    };
    reader.readAsDataURL(file);
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
    if (!imgData || !imgSize) return;
    onSave({
      id: uid(),
      name: name.trim() || '自定义板卡',
      category: '自定义',
      imgData,
      w: imgSize.w,
      h: imgSize.h,
      displayWidth: 200,
      ports,
      custom: true,
      productUrl: productUrl.trim() || undefined,
      docsUrl: docsUrl.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-full flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <div className="font-semibold text-slate-800">导入自定义器件</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!imgData ? (
            <label className="block border-2 border-dashed border-slate-300 rounded-xl py-14 text-center cursor-pointer hover:border-sky-400 transition-colors">
              <div className="text-slate-500 text-sm">点击导入器件图片（PNG / JPG / WEBP）</div>
              <div className="mt-1 text-xs text-slate-400">导入后可选地标记接线点，并保存到自定义元件库</div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
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
                />
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  新端口类型：
                  {PORT_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setNextType(t)}
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
                  type="url"
                />
                <input
                  value={docsUrl}
                  onChange={(event) => setDocsUrl(event.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                  placeholder="供应商文档链接（可选）"
                  type="url"
                />
              </div>
              <div className="text-xs text-slate-400">在图片上点击即可放置端口；端口不是必填，下方列表可改名、改类型或删除。</div>
              <div className="border border-slate-200 rounded-lg bg-slate-50 overflow-auto max-h-72 flex justify-center">
                <div className="relative inline-block">
                  <img
                    ref={imgRef}
                    src={imgData}
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
                  <div key={pt.id} className="flex items-center gap-2 text-xs">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: PORT_TYPE_COLOR[pt.type] }}
                    />
                    <input
                      value={pt.label}
                      onChange={(e) =>
                        setPorts((ps) => ps.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                      }
                      className="border border-slate-300 rounded px-1.5 py-0.5 w-32"
                    />
                    <select
                      value={pt.type}
                      onChange={(e) =>
                        setPorts((ps) =>
                          ps.map((x, j) => (j === i ? { ...x, type: e.target.value as PortType } : x)),
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
                    <span className="text-slate-400">
                      ({(pt.x * 100).toFixed(0)}%, {(pt.y * 100).toFixed(0)}%)
                    </span>
                    <button
                      className="text-slate-400 hover:text-red-500 ml-auto"
                      onClick={() => setPorts((ps) => ps.filter((_, j) => j !== i))}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700">
            取消
          </button>
          <button
            onClick={save}
            disabled={!imgData}
            className="px-4 py-1.5 text-sm rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            保存到元件库
          </button>
        </div>
      </div>
    </div>
  );
}
