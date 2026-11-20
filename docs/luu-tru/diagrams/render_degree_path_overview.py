"""Render the first review diagram with fixed, readable UML geometry."""
from pathlib import Path
from html import escape
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent / 'degree-path-module-overview-review-vi'
W, H, SCALE = 1400, 1640, 2
im = Image.new('RGB', (W * SCALE, H * SCALE), 'white')
draw = ImageDraw.Draw(im)
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
       '<title>Use case tổng quan — Degree Path Planning and Replanning Module</title>',
       '<desc>Ba actor bên ngoài module: Student, System Admin, University Core System. Mười use case chính được chia thành ba package. Đường liên kết không có mũi tên.</desc>',
       '<rect width="100%" height="100%" fill="white"/>']
INK = '#24364B'
EDGE = '#66788A'

def box(x, y, w, h, fill, stroke=EDGE, width=1.5):
    svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>')
    draw.rectangle(tuple(round(v*SCALE) for v in (x,y,x+w,y+h)), fill=fill, outline=stroke, width=round(width*SCALE))

def line(points, color=EDGE, width=1.6):
    svg.append(f'<polyline points="{" ".join(f"{x},{y}" for x,y in points)}" fill="none" stroke="{color}" stroke-width="{width}"/>')
    draw.line([(round(x*SCALE),round(y*SCALE)) for x,y in points], fill=color, width=round(width*SCALE))

def oval(x, y, rx, ry, fill='white', stroke=INK, width=1.6):
    svg.append(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>')
    draw.ellipse(tuple(round(v*SCALE) for v in (x-rx,y-ry,x+rx,y+ry)), fill=fill, outline=stroke, width=round(width*SCALE))

def text(x,y,value,size=21,bold=False,anchor='middle',color=INK):
    font=ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf' if bold else 'C:/Windows/Fonts/arial.ttf', size*SCALE)
    svg.append(f'<text x="{x}" y="{y}" text-anchor="{anchor}" dominant-baseline="central" font-family="Arial, sans-serif" font-size="{size}" font-weight="{"bold" if bold else "normal"}" fill="{color}">{escape(value)}</text>')
    draw.text((round(x*SCALE),round(y*SCALE)), value, font=font, fill=color, anchor='mm' if anchor=='middle' else 'lm')

def actor(x,y,name):
    oval(x,y,15,15)
    line([(x,y+15),(x,y+65)],INK,2)
    line([(x-27,y+34),(x+27,y+34)],INK,2)
    line([(x-25,y+94),(x,y+65),(x+25,y+94)],INK,2)
    for i,part in enumerate(name): text(x,y+118+i*27,part,22,True)

def package(y,h,label,tabw,fill):
    box(350,y,tabw,34,fill,'#A0AFBD')
    box(350,y+34,700,h-34,fill,'#A0AFBD')
    text(367,y+17,label,20,True,'start')

text(700,43,'SƠ ĐỒ USE CASE TỔNG QUAN',30,True)
text(700,81,'Các chức năng chính · Bản 01 để xem xét',20,color='#5F7082')
box(300,125,800,1370,'white',INK,2)
text(700,155,'Degree Path Planning and Replanning Module',25,True)

package(205,530,'Lập và theo dõi lộ trình',280,'#F2F7FC')
package(775,330,'Hỗ trợ đăng ký và lập lại lộ trình',375,'#F1F8F4')
package(1145,300,'Vận hành đồng bộ dữ liệu',310,'#FCF7ED')

cases = [
    ('UC01',285,['Xem tiến độ học tập']),
    ('UC02',385,['Sinh các lộ trình học tập']),
    ('UC03',485,['So sánh các lộ trình']),
    ('UC04',585,['Chọn lộ trình đang theo dõi']),
    ('UC11',685,['Xem lịch sử lộ trình']),
    ('UC06',855,['Xem gợi ý môn cho kỳ đăng ký']),
    ('UC08',955,['Phân tích phương án đăng ký giả định']),
    ('UC09',1055,['Lập lại lộ trình tương lai']),
    ('UC14',1245,['Khởi tạo đồng bộ dữ liệu']),
    ('UC15',1370,['Xem trạng thái và lỗi đồng bộ']),
]

# Each association is a separate, arrowless line terminating on the ellipse.
for code,y,_ in cases:
    if code == 'UC06':
        line([(152,604),(320,835),(455,y)])
    else:
        line([(152,604 if code not in ('UC14','UC15') else 1284),(455,y)])
for y in (385,1055,1245):
    line([(945,y),(1243,804)])

for code,y,labels in cases:
    oval(700,y,245,39)
    text(700,y-13,code,18,True,color='#46617D')
    text(700,y+13,labels[0],21)

actor(125,570,['Student'])
actor(125,1250,['System Admin'])
actor(1270,770,['University','Core System'])

text(300,1530,'Khung ngoài: module. Package bên trong: nhóm chức năng. Đường liền: sự tham gia của actor.',17,anchor='start',color='#526477')
text(300,1562,'Dữ liệu trường chỉ đọc; đăng ký môn chính thức thực hiện tại cổng trường.',17,anchor='start',color='#526477')
text(300,1594,'Mã UC giữ theo danh mục đề xuất; các use case còn lại sẽ được trình bày ở sơ đồ chi tiết.',17,anchor='start',color='#526477')
svg.append('</svg>')
OUT.with_suffix('.svg').write_text('\n'.join(svg), encoding='utf-8')
im.save(OUT.with_suffix('.png'))
print(f'Rendered {OUT.name}: SVG {W}x{H}, PNG {W*SCALE}x{H*SCALE}')
