# Готовит картинки персонажа для веба:
#   uploads/formN_theme_c.webp  — формы для приложения (PNG 215 КБ -> WebP ~20 КБ, альфа сохраняется)
#   uploads/share_formN_theme.jpg — карточки для «Поделиться» (Telegram принимает в inline-результатах только JPEG)
#
#   python tools/make-images.py <папка с исходными PNG>
#
# Исходные PNG в репозитории не нужны — см. reference/forms-original и историю git.
import os, sys, glob
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else 'reference/forms-original'
OUT = 'uploads'
# фон карточки шеринга = фон темы приложения (см. _themes() в index.html)
BG = {'amber': (0x3B, 0x3C, 0x36), 'azure': (0x1A, 0x29, 0x35), 'spark': (0x2B, 0x1F, 0x24)}

os.makedirs(OUT, exist_ok=True)
for p in sorted(glob.glob(os.path.join(SRC, 'form*_*.png'))):
    base = os.path.basename(p)[:-4]          # form1_amber или form1_amber_c
    name = base[:-2] if base.endswith('_c') else base
    form, theme = name.split('_')
    im = Image.open(p).convert('RGBA')
    im.save(os.path.join(OUT, f'{name}_c.webp'), 'WEBP', quality=86, method=6)
    # карточка: квадрат 640, персонаж по центру на фоне темы
    card = Image.new('RGB', (640, 640), BG.get(theme, BG['amber']))
    fig = im.copy(); fig.thumbnail((520, 520))
    card.paste(fig, ((640 - fig.width) // 2, (640 - fig.height) // 2), fig)
    card.save(os.path.join(OUT, f'share_{form}_{theme}.jpg'), 'JPEG', quality=88, optimize=True)
    print(name, 'ok')
