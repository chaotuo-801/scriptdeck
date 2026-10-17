import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScanCandidate } from '../../shared/types'
import { Icon, Spinner } from './Ui'

interface Props {
  onClose: () => void
  onDone: (ids: string[]) => void | Promise<void>
  notify: (kind: 'info' | 'error', message: string) => void
}

export default function ImportModal({ onClose, onDone, notify }: Props) {
  const [dir, setDir] = useState('')
  const [candidates, setCandidates] = useState<ScanCandidate[]>([])
  const [busy, setBusy] = useState(false)
  const started = useRef(false)

  const scan = useCallback(async (target: string) => {
    setBusy(true)
    try {
      const found = await window.sd.importer.scan(target)
      setCandidates(found)
      if (!found.length) notify('info', '该目录没有找到可导入的脚本')
    } catch (err) {
      notify('error', (err as Error).message)
    } finally {
      setBusy(false)
    }
  }, [notify])

  const pick = useCallback(async () => {
    const target = await window.sd.dialogs.pickFolder()
    if (!target) { onClose(); return }
    setDir(target)
    await scan(target)
  }, [onClose, scan])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void pick()
  }, [pick])

  const toggle = (index: number) => {
    setCandidates(prev => prev.map((c, i) => i === index ? { ...c, selected: !c.selected } : c))
  }

  const selected = candidates.filter(c => c.selected)
  const commit = async () => {
    if (!selected.length) { notify('error', '请至少选择一个脚本'); return }
    try {
      const created = await window.sd.importer.commit(selected)
      await onDone(created.map(c => c!.id))
    } catch (err) {
      notify('error', (err as Error).message)
    }
  }

  return (
    <>
      <div className="ov" onClick={onClose} />
      <div className="modal">
        <div className="mh">
          <h3>从文件夹导入</h3>
          <span className="path" title={dir}>{dir || '未选择目录'}</span>
          <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={() => void pick()}>重新选择</button>
          <button className="btn ghost" onClick={onClose}><Icon name="close" size={13} /></button>
        </div>
        <div className="mb">
          {busy ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 24, color: 'var(--dim)' }}>
              <Spinner />正在扫描目录，识别解释器与端口…
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr><th style={{ width: 40 }} /><th>文件</th><th style={{ width: 110 }}>解释器</th><th style={{ width: 90 }}>端口</th><th style={{ width: 190 }}>状态</th></tr>
              </thead>
              <tbody>
                {candidates.map((c, i) => (
                  <tr key={c.path} className={`${c.selected ? 'selrow' : ''} clickable`} onClick={() => toggle(i)}>
                    <td><button className={`cb ${c.selected ? 'on' : ''}`} onClick={e => { e.stopPropagation(); toggle(i) }}>{c.selected ? '✓' : ''}</button></td>
                    <td className="fn" title={c.path}>{c.name}{c.path.toLowerCase().endsWith('.exe') ? '.exe' : ''}</td>
                    <td>{c.kind}</td>
                    <td>{c.port ?? '—'}</td>
                    <td className={c.warning ? 'warn' : 'okt'} title={c.warning}>{c.warning ?? '可导入'}</td>
                  </tr>
                ))}
                {!candidates.length ? <tr><td colSpan={5} style={{ padding: 22, color: 'var(--dim)' }}>没有可导入的文件</td></tr> : null}
              </tbody>
            </table>
          )}
        </div>
        <div className="mf">
          <span>已选择 {selected.length} 项 · 自动识别解释器与端口，导入后可继续修改</span>
          <div className="r">
            <button className="btn" onClick={onClose}>取消</button>
            <button className="btn primary" disabled={!selected.length} onClick={() => void commit()}>导入并创建</button>
          </div>
        </div>
      </div>
    </>
  )
}
