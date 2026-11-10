import { Fragment, type ReactNode } from 'react';

/** `**đậm**` -> <strong>. Không dùng innerHTML nên nội dung từ model không chèn được HTML. */
const inline = (text: string): ReactNode[] => text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => (
    part.startsWith('**') && part.endsWith('**') && part.length > 4
        ? <strong key={index}>{part.slice(2, -2)}</strong>
        : <Fragment key={index}>{part}</Fragment>
));

/** Định dạng tối giản cho câu trả lời của AI: đoạn văn, dòng "- " thành danh sách, chữ đậm. */
export const RichText = ({ text }: { text: string }) => {
    const blocks: ReactNode[] = [];
    let bullets: string[] = [];
    const flush = () => {
        if (!bullets.length) return;
        blocks.push(<ul key={`ul-${blocks.length}`}>{bullets.map((item, index) => <li key={index}>{inline(item)}</li>)}</ul>);
        bullets = [];
    };
    text.split('\n').forEach(raw => {
        const line = raw.trimEnd();
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        if (bullet) {
            bullets.push(bullet[1]);
            return;
        }
        flush();
        if (line.trim()) blocks.push(<p key={`p-${blocks.length}`}>{inline(line)}</p>);
    });
    flush();
    return <div className="advisor-richtext">{blocks}</div>;
};

export default RichText;
