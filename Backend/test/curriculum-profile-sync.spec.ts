import { htmlToText } from '../src/database/sync-curriculum-profiles';

describe('htmlToText (myBK curriculum profile)', () => {
  it('turns paragraphs, line breaks and list items into plain text', () => {
    const html = '<p>\r\n\r\nĐoạn&nbsp;một &amp; <b>hai</b><br>dòng mới</p><ul><li>Mục 1</li><li>Mục&#160;2</li></ul>';
    expect(htmlToText(html)).toBe('Đoạn một & hai\ndòng mới\n\n- Mục 1\n\n- Mục 2');
  });

  it('normalizes hand-typed bullets and drops empty content', () => {
    expect(htmlToText('<p>· &nbsp; &nbsp; <b>Giảng viên:</b>&nbsp;giảng dạy</p>')).toBe('- Giảng viên: giảng dạy');
    expect(htmlToText('<p>\r\n\r\n<br></p>')).toBeNull();
    expect(htmlToText(null)).toBeNull();
  });
});
