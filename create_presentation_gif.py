from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).parent
OUT = ROOT / "presentacion-insomnio.gif"
W, H = 540, 960

def font(size, bold=False):
    path = "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"
    return ImageFont.truetype(path, size)

def text(draw, xy, value, size, color, bold=False, anchor="la"):
    draw.text(xy, value, font=font(size, bold), fill=color, anchor=anchor)

def base():
    image = Image.open(ROOT / "assets" / "hero-mountain.jpg").convert("RGB")
    image = image.resize((W, H))
    overlay = Image.new("RGBA", (W, H), (5, 6, 8, 190))
    return Image.alpha_composite(image.convert("RGBA"), overlay)

def panel(image, box):
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.rounded_rectangle(box, radius=18, fill=(18, 20, 25, 240), outline=(255, 255, 255, 30), width=1)
    return Image.alpha_composite(image, layer)

def hero_frame():
    image = base()
    draw = ImageDraw.Draw(image)
    logo = Image.open(ROOT / "assets" / "insomnio-logo-transparent.png").convert("RGBA")
    logo.thumbnail((118, 118))
    image.alpha_composite(logo, ((W - logo.width) // 2, 160))
    text(draw, (W // 2, 340), "INSOMNIO", 64, "#f6f4ef", True, "ma")
    text(draw, (W // 2, 404), "4TH JULIO | PARQUE SOFO | DESDE LAS 22 HRS", 13, "#c8ccd1", True, "ma")
    draw.rounded_rectangle((120, 470, 420, 530), radius=9, fill="#f36d22")
    text(draw, (W // 2, 500), "COMPRAR ENTRADAS", 16, "white", True, "mm")
    text(draw, (W // 2, 720), "ENTRADAS DIGITALES", 15, "#ffb17a", True, "ma")
    text(draw, (W // 2, 754), "Pago seguro y QR personal", 20, "#f6f4ef", True, "ma")
    return image

def selection_frame():
    image = base()
    image = panel(image, (22, 86, 518, 856))
    draw = ImageDraw.Draw(image)
    text(draw, (48, 126), "1", 18, "white", True, "mm")
    draw.ellipse((30, 108, 66, 144), fill="#f36d22")
    text(draw, (82, 126), "ENTRADAS", 24, "#f6f4ef", True, "lm")
    rows = [("ENTRADA GENERAL", "$8.000", "1"), ("ENTRADA + UN COVER", "$10.000", "1"), ("ENTRADA + DOS COVER", "$12.000", "0")]
    for index, (name, price, qty) in enumerate(rows):
        y = 170 + index * 160
        color = "#f36d22" if qty == "1" else "#31343a"
        draw.rounded_rectangle((42, y, 498, y + 138), radius=13, fill="#1b1d22", outline=color, width=2)
        text(draw, (64, y + 34), name, 16, "#f6f4ef", True)
        text(draw, (64, y + 64), price, 21, "#f6f4ef", True)
        text(draw, (286, y + 107), f"-      {qty}      +", 19, "#f6f4ef", True, "ma")
    draw.rounded_rectangle((42, 674, 498, 818), radius=13, fill="#22242a")
    text(draw, (64, 712), "$18.000", 30, "white", True)
    text(draw, (64, 744), "Total a pagar", 15, "#b6bbc2", True)
    draw.rounded_rectangle((64, 770, 476, 810), radius=8, fill="#f36d22")
    text(draw, (270, 790), "COMPRAR ENTRADAS", 15, "white", True, "mm")
    return image

def checkout_frame():
    source = Image.open("C:/Users/josei/Pictures/Screenshots/Captura de pantalla 2026-09-08 233621.png").convert("RGB")
    canvas = Image.new("RGB", (W, H), "#111318")
    source.thumbnail((W - 46, H - 176))
    canvas.paste(source, ((W - source.width) // 2, 112))
    draw = ImageDraw.Draw(canvas)
    text(draw, (W // 2, 54), "PAGO SEGURO CON MERCADO PAGO", 18, "#ffb17a", True, "ma")
    text(draw, (W // 2, 895), "Tarjeta de prueba - pago aprobado", 15, "#f6f4ef", True, "ma")
    return canvas.convert("RGBA")

def validation_frame():
    image = base()
    image = panel(image, (30, 126, 510, 830))
    draw = ImageDraw.Draw(image)
    text(draw, (270, 182), "VALIDACION DE ACCESO", 18, "#ffb17a", True, "ma")
    text(draw, (270, 228), "Escanea el QR personal", 25, "#f6f4ef", True, "ma")
    draw.rounded_rectangle((106, 278, 434, 606), radius=10, fill="white")
    for x in range(122, 417, 22):
        for y in range(294, 589, 22):
            if (x * 7 + y * 11) % 5 < 2:
                draw.rectangle((x, y, x + 15, y + 15), fill="#111318")
    draw.rounded_rectangle((72, 646, 468, 704), radius=9, fill="#16835f")
    text(draw, (270, 675), "ENTRADA VALIDA - INGRESO REGISTRADO", 14, "white", True, "ma")
    text(draw, (270, 748), "Una segunda lectura muestra: QR ya utilizado", 14, "#ffb17a", True, "ma")
    return image

frames = [hero_frame(), selection_frame(), checkout_frame(), validation_frame()]
frame_names = ["01-portada.png", "02-seleccion-entradas.png", "03-pago-mercado-pago.png", "04-validacion-qr.png"]
for frame, name in zip(frames, frame_names):
    frame.convert("RGB").save(ROOT / name, "PNG")
animated = []
for frame in frames:
    animated.extend([frame.convert("P", palette=Image.Palette.ADAPTIVE)] * 20)
animated[0].save(OUT, save_all=True, append_images=animated[1:], duration=100, loop=0, disposal=2)
print(OUT)
