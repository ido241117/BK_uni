import { Input, Tabs, type TabsProps } from 'antd';
import { useState, type DragEvent, type ReactNode } from 'react';
import { PiFileArrowUp, PiFilePdf, PiListPlus, PiNotePencil, PiSparkleFill } from 'react-icons/pi';
import { SparklePage } from '@/components/EmptyState/illustrations';
import { IOutLinedBtn, ISolidBtn, ITextBtn } from '@/components/Button';

/*
 * Pieces from ui-template/components-template-2.html (row note, empty table, loading) and modal.html
 * (modal title, upload zone, numbered steps), plus PageTabs.
 */

/** Dashed-underline trigger in a table row: "Thêm ghi chú" or the current note. */
export const NoteTrigger = ({ note, onClick }: { note?: string; onClick: () => void }) => (
    <button type="button" className="note-trigger" onClick={onClick}>
        <PiNotePencil aria-hidden="true" />
        {note ? <span>Ghi chú: “{note}”</span> : 'Thêm ghi chú'}
    </button>
);

interface NoteBoxProps {
    /** Shown in the label: "Ghi chú cho CO2003". */
    code: string;
    initial: string;
    onSave: (note: string) => void;
    onClose: () => void;
}

/** Multi-line note box shown in an expanded table row. */
export const NoteBox = ({ code, initial, onSave, onClose }: NoteBoxProps) => {
    const [value, setValue] = useState(initial);

    return (
        <div className="note-box">
            <div className="note-box-lbl"><PiNotePencil aria-hidden="true" /> Ghi chú cho {code}</div>
            <Input.TextArea value={value} onChange={event => setValue(event.target.value)} autoSize={{ minRows: 2 }}
                placeholder="Nhập ghi chú học phần..." aria-label={`Ghi chú cho ${code}`} />
            <div className="note-actions">
                <ITextBtn size="small" onClick={onClose}>Hủy</ITextBtn>
                <ISolidBtn size="small" onClick={() => onSave(value.trim())}>Lưu ghi chú</ISolidBtn>
            </div>
        </div>
    );
};

/** Message for a table with no rows (blush band between hairlines). */
export const EmptyTableLine = ({ children, icon = <PiListPlus /> }: { children: ReactNode; icon?: ReactNode }) => (
    <div className="empty-table-line" role="status">
        <span className="empty-table-icon" aria-hidden="true">{icon}</span>
        <span>{children}</span>
    </div>
);

/** Loading state shaped like the page: a pulsing bead, a title bar and a few table-like rows. */
export const PageLoading = ({ label = 'Đang tải dữ liệu...', rows = 3 }: { label?: string; rows?: number }) => (
    <div className="loading-shell" aria-busy="true" role="status">
        <div className="loading-top"><PiSparkleFill className="loading-spark" aria-hidden="true" />{label}</div>
        <div className="skel-line" style={{ width: '42%', height: 18, marginBottom: 18 }} />
        {Array.from({ length: rows }, (_, index) => (
            <div className="skel-row" key={index}>
                <div><span className="loading-bead" /><span className="skel-line skel-inline" style={{ width: 58 }} /></div>
                <div className="skel-line" style={{ width: `${78 - index * 9}%` }} />
                <div className="skel-line" style={{ width: 40 }} />
                <div className="skel-line" style={{ width: 64 }} />
            </div>
        ))}
    </div>
);

/** Whole-page loading (a page opening, the session check): floating sparkle page with twinkling sparkles. */
export const RouteLoading = ({ label = 'Đang tải trang...' }: { label?: string }) => (
    <div className="route-loading" role="status" aria-busy="true">
        <SparklePage className="route-loading-art" />
        <span>{label}</span>
    </div>
);

/** Modal title with a small rose eyebrow above the serif title (modal.html). */
export const ModalTitle = ({ eyebrow, icon, children }: { eyebrow?: ReactNode; icon?: ReactNode; children: ReactNode }) => (
    <div>
        {eyebrow && <div className="modal-eyebrow">{icon && <span aria-hidden="true">{icon}</span>}{eyebrow}</div>}
        {children}
    </div>
);

interface UploadZoneProps {
    accept: string;
    onFile: (file: File) => void;
    fileName?: string;
    note?: ReactNode;
    buttonLabel?: ReactNode;
}

/** Drop zone + "Chọn file" button (modal.html `.upload-zone`). */
export const UploadZone = ({
    accept, onFile, fileName, note = 'Kéo thả file vào đây hoặc bấm nút bên dưới', buttonLabel = 'Chọn file PDF',
}: UploadZoneProps) => {
    const [over, setOver] = useState(false);
    const [input, setInput] = useState<HTMLInputElement | null>(null);
    const stop = (event: DragEvent) => { event.preventDefault(); event.stopPropagation(); };

    return (
        <div
            className="upload-zone" data-over={over}
            onDragEnter={(event) => { stop(event); setOver(true); }}
            onDragOver={(event) => { stop(event); setOver(true); }}
            onDragLeave={(event) => { stop(event); setOver(false); }}
            onDrop={(event) => {
                stop(event); setOver(false);
                const file = event.dataTransfer.files?.[0];
                if (file) onFile(file);
            }}
        >
            <span className="upload-ico" aria-hidden="true"><PiFileArrowUp /></span>
            <span className="upload-note">{note}</span>
            <input ref={setInput} type="file" accept={accept} hidden
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onFile(file);
                    event.target.value = '';
                }} />
            <IOutLinedBtn icon={<PiFilePdf />} onClick={() => input?.click()}>{buttonLabel}</IOutLinedBtn>
            {fileName && <span className="selected-file"><PiFilePdf aria-hidden="true" /> Đã chọn: {fileName}</span>}
        </div>
    );
};

/** Numbered instructions with serif rose numbers (modal.html `.step-list`). */
export const StepList = ({ children }: { children: ReactNode }) => <ol className="step-list">{children}</ol>;

/** Tabs that hide the tab bar while there is only one tab; adding a second item brings the bar back. */
export const PageTabs = ({ items = [], ...rest }: TabsProps) => (items.length > 1
    ? <Tabs {...rest} items={items} />
    : <>{items[0]?.children}</>);
