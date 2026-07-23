from dataclasses import asdict
import json
import unicodedata
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.domain.fasting import build_fasting_guidance
from app.domain.nutrition import calculate_targets
from app.schemas import (
    FastingGuidanceRequest,
    FastingGuidanceResponse,
    FoodSearchResponse,
    GoalRequest,
    GoalResponse,
)

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://localhost:3000",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://192.168.0.6:8081",
        "http://localhost:8082",
        "http://127.0.0.1:8082",
        "http://192.168.0.7:8082",
        "https://nutricao-fitness-web.vercel.app",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):(8081|8082)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

COMMON_FOODS = [
    {"code": "br-carne-bovina-patinho-cozido", "name": "Carne bovina patinho cozido", "aliases": "patinho bife carne magra bovina boi", "brand": "Base comum", "calories_kcal_100g": 219, "protein_g_100g": 35.9, "carbs_g_100g": 0, "fat_g_100g": 7.3, "source": "base_comum"},
    {"code": "br-carne-bovina-acem-cozido", "name": "Carne bovina acem cozido", "aliases": "acem carne panela bovina boi", "brand": "Base comum", "calories_kcal_100g": 215, "protein_g_100g": 27.3, "carbs_g_100g": 0, "fat_g_100g": 10.9, "source": "base_comum"},
    {"code": "br-carne-bovina-alcatra-grelhada", "name": "Carne bovina alcatra grelhada", "aliases": "alcatra bife carne grelhada bovina boi", "brand": "Base comum", "calories_kcal_100g": 241, "protein_g_100g": 31.9, "carbs_g_100g": 0, "fat_g_100g": 11.6, "source": "base_comum"},
    {"code": "br-carne-bovina-contra-file-grelhado", "name": "Carne bovina contra-file grelhado", "aliases": "contrafile contra file bife carne grelhada bovina boi", "brand": "Base comum", "calories_kcal_100g": 278, "protein_g_100g": 32.4, "carbs_g_100g": 0, "fat_g_100g": 15.5, "source": "base_comum"},
    {"code": "br-carne-moida-cozida", "name": "Carne bovina moida cozida", "aliases": "carne moida mo?do mo?da patinho moido bovina boi", "brand": "Base comum", "calories_kcal_100g": 250, "protein_g_100g": 26.7, "carbs_g_100g": 0, "fat_g_100g": 15.0, "source": "base_comum"},
    {"code": "br-carne-bovina-coxao-mole-cozido", "name": "Carne bovina coxao mole cozido", "aliases": "coxao mole cox?o bife carne bovina", "brand": "Base comum", "calories_kcal_100g": 219, "protein_g_100g": 32.4, "carbs_g_100g": 0, "fat_g_100g": 8.9, "source": "base_comum"},
    {"code": "br-carne-bovina-musculo-cozido", "name": "Carne bovina musculo cozido", "aliases": "musculo m?sculo carne panela sopa bovina", "brand": "Base comum", "calories_kcal_100g": 194, "protein_g_100g": 31.2, "carbs_g_100g": 0, "fat_g_100g": 6.7, "source": "base_comum"},
    {"code": "br-figado-bovino-grelhado", "name": "Figado bovino grelhado", "aliases": "figado f?gado bife bovino miudo", "brand": "Base comum", "calories_kcal_100g": 225, "protein_g_100g": 29.9, "carbs_g_100g": 4.2, "fat_g_100g": 9.0, "source": "base_comum"},
    {"code": "br-picanha-grelhada", "name": "Picanha grelhada", "aliases": "picanha churrasco carne bovina boi", "brand": "Base comum", "calories_kcal_100g": 289, "protein_g_100g": 26.4, "carbs_g_100g": 0, "fat_g_100g": 19.5, "source": "base_comum"},
    {"code": "br-frango-peito-grelhado", "name": "Peito de frango grelhado", "aliases": "frango peito file fil? grelhado chicken", "brand": "Base comum", "calories_kcal_100g": 165, "protein_g_100g": 31.0, "carbs_g_100g": 0, "fat_g_100g": 3.6, "source": "base_comum"},
    {"code": "br-frango-coxa-assada", "name": "Coxa de frango assada", "aliases": "frango coxa assada", "brand": "Base comum", "calories_kcal_100g": 215, "protein_g_100g": 27.0, "carbs_g_100g": 0, "fat_g_100g": 11.0, "source": "base_comum"},
    {"code": "br-frango-sobrecoxa-assada", "name": "Sobrecoxa de frango assada", "aliases": "frango sobrecoxa assada", "brand": "Base comum", "calories_kcal_100g": 233, "protein_g_100g": 25.0, "carbs_g_100g": 0, "fat_g_100g": 14.0, "source": "base_comum"},
    {"code": "br-frango-desfiado-cozido", "name": "Frango desfiado cozido", "aliases": "frango desfiado cozido peito", "brand": "Base comum", "calories_kcal_100g": 163, "protein_g_100g": 30.0, "carbs_g_100g": 0, "fat_g_100g": 3.5, "source": "base_comum"},
    {"code": "br-ovo-cozido", "name": "Ovo de galinha cozido", "aliases": "ovo cozido ovos galinha", "brand": "Base comum", "calories_kcal_100g": 155, "protein_g_100g": 12.6, "carbs_g_100g": 1.1, "fat_g_100g": 10.6, "source": "base_comum"},
    {"code": "br-ovo-mexido", "name": "Ovo mexido", "aliases": "ovo ovos mexidos frigideira", "brand": "Base comum", "calories_kcal_100g": 166, "protein_g_100g": 11.0, "carbs_g_100g": 2.2, "fat_g_100g": 12.0, "source": "base_comum"},
    {"code": "br-tilapia-grelhada", "name": "Tilapia grelhada", "aliases": "tilapia peixe pescado grelhado", "brand": "Base comum", "calories_kcal_100g": 128, "protein_g_100g": 26.0, "carbs_g_100g": 0, "fat_g_100g": 2.7, "source": "base_comum"},
    {"code": "br-sardinha-assada", "name": "Sardinha assada", "aliases": "sardinha peixe pescado", "brand": "Base comum", "calories_kcal_100g": 164, "protein_g_100g": 32.2, "carbs_g_100g": 0, "fat_g_100g": 3.0, "source": "base_comum"},
    {"code": "br-atum-em-agua", "name": "Atum em agua", "aliases": "atum lata enlatado agua peixe", "brand": "Base comum", "calories_kcal_100g": 116, "protein_g_100g": 26.0, "carbs_g_100g": 0, "fat_g_100g": 1.0, "source": "base_comum"},
    {"code": "br-arroz-branco-cozido", "name": "Arroz branco cozido", "aliases": "arroz branco cozido arroz comum", "brand": "Base comum", "calories_kcal_100g": 128, "protein_g_100g": 2.5, "carbs_g_100g": 28.1, "fat_g_100g": 0.2, "source": "base_comum"},
    {"code": "br-arroz-integral-cozido", "name": "Arroz integral cozido", "aliases": "arroz integral cozido", "brand": "Base comum", "calories_kcal_100g": 124, "protein_g_100g": 2.6, "carbs_g_100g": 25.8, "fat_g_100g": 1.0, "source": "base_comum"},
    {"code": "br-feijao-carioca-cozido", "name": "Feijao carioca cozido", "aliases": "feijao feij?o carioca cozido", "brand": "Base comum", "calories_kcal_100g": 76, "protein_g_100g": 4.8, "carbs_g_100g": 13.6, "fat_g_100g": 0.5, "source": "base_comum"},
    {"code": "br-feijao-preto-cozido", "name": "Feijao preto cozido", "aliases": "feijao feij?o preto cozido", "brand": "Base comum", "calories_kcal_100g": 77, "protein_g_100g": 4.5, "carbs_g_100g": 14.0, "fat_g_100g": 0.5, "source": "base_comum"},
    {"code": "br-lentilha-cozida", "name": "Lentilha cozida", "aliases": "lentilha leguminosa", "brand": "Base comum", "calories_kcal_100g": 93, "protein_g_100g": 6.3, "carbs_g_100g": 16.3, "fat_g_100g": 0.5, "source": "base_comum"},
    {"code": "br-grao-de-bico-cozido", "name": "Grao-de-bico cozido", "aliases": "grao de bico gr?o-de-bico grao-de-bico", "brand": "Base comum", "calories_kcal_100g": 164, "protein_g_100g": 8.9, "carbs_g_100g": 27.4, "fat_g_100g": 2.6, "source": "base_comum"},
    {"code": "br-macarrao-cozido", "name": "Macarrao cozido", "aliases": "macarrao macarr?o massa pasta cozido", "brand": "Base comum", "calories_kcal_100g": 158, "protein_g_100g": 5.8, "carbs_g_100g": 30.9, "fat_g_100g": 0.9, "source": "base_comum"},
    {"code": "br-batata-doce-cozida", "name": "Batata-doce cozida", "aliases": "batata doce batata-doce cozida", "brand": "Base comum", "calories_kcal_100g": 77, "protein_g_100g": 0.6, "carbs_g_100g": 18.4, "fat_g_100g": 0.1, "source": "base_comum"},
    {"code": "br-batata-inglesa-cozida", "name": "Batata inglesa cozida", "aliases": "batata inglesa batata comum cozida", "brand": "Base comum", "calories_kcal_100g": 52, "protein_g_100g": 1.2, "carbs_g_100g": 11.9, "fat_g_100g": 0, "source": "base_comum"},
    {"code": "br-mandioca-cozida", "name": "Mandioca cozida", "aliases": "mandioca aipim macaxeira cozida", "brand": "Base comum", "calories_kcal_100g": 125, "protein_g_100g": 0.6, "carbs_g_100g": 30.1, "fat_g_100g": 0.3, "source": "base_comum"},
    {"code": "br-aveia-flocos", "name": "Aveia em flocos", "aliases": "aveia flocos farinha mingau", "brand": "Base comum", "calories_kcal_100g": 394, "protein_g_100g": 13.9, "carbs_g_100g": 66.6, "fat_g_100g": 8.5, "source": "base_comum"},
    {"code": "br-pao-frances", "name": "Pao frances", "aliases": "pao p?o frances franc?s cacetinho", "brand": "Base comum", "calories_kcal_100g": 300, "protein_g_100g": 8.0, "carbs_g_100g": 58.6, "fat_g_100g": 3.1, "source": "base_comum"},
    {"code": "br-banana-prata", "name": "Banana prata", "aliases": "banana prata", "brand": "Base comum", "calories_kcal_100g": 98, "protein_g_100g": 1.3, "carbs_g_100g": 26.0, "fat_g_100g": 0.1, "source": "base_comum"},
    {"code": "br-maca", "name": "Maca", "aliases": "maca ma?? apple fruta", "brand": "Base comum", "calories_kcal_100g": 56, "protein_g_100g": 0.3, "carbs_g_100g": 15.2, "fat_g_100g": 0.2, "source": "base_comum"},
    {"code": "br-mamao-papaia", "name": "Mamao papaia", "aliases": "mamao mam?o papaia fruta", "brand": "Base comum", "calories_kcal_100g": 45, "protein_g_100g": 0.8, "carbs_g_100g": 11.6, "fat_g_100g": 0.1, "source": "base_comum"},
    {"code": "br-laranja", "name": "Laranja", "aliases": "laranja fruta", "brand": "Base comum", "calories_kcal_100g": 47, "protein_g_100g": 0.9, "carbs_g_100g": 11.8, "fat_g_100g": 0.1, "source": "base_comum"},
    {"code": "br-abacate", "name": "Abacate", "aliases": "abacate avocado fruta", "brand": "Base comum", "calories_kcal_100g": 96, "protein_g_100g": 1.2, "carbs_g_100g": 6.0, "fat_g_100g": 8.4, "source": "base_comum"},
    {"code": "br-tomate", "name": "Tomate", "aliases": "tomate salada legume", "brand": "Base comum", "calories_kcal_100g": 15, "protein_g_100g": 1.1, "carbs_g_100g": 3.1, "fat_g_100g": 0.2, "source": "base_comum"},
    {"code": "br-alface", "name": "Alface", "aliases": "alface salada folha verdura", "brand": "Base comum", "calories_kcal_100g": 14, "protein_g_100g": 1.7, "carbs_g_100g": 2.4, "fat_g_100g": 0.1, "source": "base_comum"},
    {"code": "br-cenoura-cozida", "name": "Cenoura cozida", "aliases": "cenoura legume cozida", "brand": "Base comum", "calories_kcal_100g": 30, "protein_g_100g": 0.8, "carbs_g_100g": 6.7, "fat_g_100g": 0.2, "source": "base_comum"},
    {"code": "br-brocolis-cozido", "name": "Brocolis cozido", "aliases": "brocolis br?colis legume verdura cozido", "brand": "Base comum", "calories_kcal_100g": 25, "protein_g_100g": 2.1, "carbs_g_100g": 4.4, "fat_g_100g": 0.5, "source": "base_comum"},
    {"code": "br-leite-integral", "name": "Leite integral", "aliases": "leite integral laticinio l?cteo", "brand": "Base comum", "calories_kcal_100g": 61, "protein_g_100g": 3.2, "carbs_g_100g": 4.7, "fat_g_100g": 3.3, "source": "base_comum"},
    {"code": "br-iogurte-natural", "name": "Iogurte natural", "aliases": "iogurte natural iorgute yogurt", "brand": "Base comum", "calories_kcal_100g": 61, "protein_g_100g": 3.5, "carbs_g_100g": 4.7, "fat_g_100g": 3.3, "source": "base_comum"},
    {"code": "br-queijo-minas", "name": "Queijo minas frescal", "aliases": "queijo minas frescal laticinio", "brand": "Base comum", "calories_kcal_100g": 264, "protein_g_100g": 17.4, "carbs_g_100g": 3.2, "fat_g_100g": 20.2, "source": "base_comum"},
    {"code": "br-mussarela", "name": "Queijo mussarela", "aliases": "mussarela mozzarella queijo", "brand": "Base comum", "calories_kcal_100g": 330, "protein_g_100g": 22.6, "carbs_g_100g": 3.0, "fat_g_100g": 25.2, "source": "base_comum"},
    {"code": "br-azeite", "name": "Azeite de oliva", "aliases": "azeite oliva oleo ?leo gordura", "brand": "Base comum", "calories_kcal_100g": 884, "protein_g_100g": 0, "carbs_g_100g": 0, "fat_g_100g": 100, "source": "base_comum"},
    {"code": "br-manteiga", "name": "Manteiga", "aliases": "manteiga gordura", "brand": "Base comum", "calories_kcal_100g": 717, "protein_g_100g": 0.9, "carbs_g_100g": 0.1, "fat_g_100g": 81.1, "source": "base_comum"},
    {"code": "br-castanha-caju", "name": "Castanha de caju", "aliases": "castanha caju oleaginosa", "brand": "Base comum", "calories_kcal_100g": 570, "protein_g_100g": 18.5, "carbs_g_100g": 29.1, "fat_g_100g": 46.3, "source": "base_comum"},
    {"code": "br-hamburguer-simples", "name": "Hamburguer simples", "aliases": "hamburguer hamburger sanduiche fast food pao carne queijo lanche", "brand": "Base comum", "calories_kcal_100g": 295, "protein_g_100g": 15.0, "carbs_g_100g": 28.0, "fat_g_100g": 14.0, "source": "base_comum"},
    {"code": "br-x-burguer", "name": "X-burguer", "aliases": "xburguer x burguer cheeseburger hamburguer queijo fast food lanche", "brand": "Base comum", "calories_kcal_100g": 305, "protein_g_100g": 15.5, "carbs_g_100g": 26.0, "fat_g_100g": 16.0, "source": "base_comum"},
    {"code": "br-x-salada", "name": "X-salada", "aliases": "xsalada x salada hamburguer queijo alface tomate fast food lanche", "brand": "Base comum", "calories_kcal_100g": 285, "protein_g_100g": 14.0, "carbs_g_100g": 25.0, "fat_g_100g": 15.0, "source": "base_comum"},
    {"code": "br-x-bacon", "name": "X-bacon", "aliases": "xbacon x bacon hamburguer queijo bacon fast food lanche", "brand": "Base comum", "calories_kcal_100g": 335, "protein_g_100g": 16.0, "carbs_g_100g": 25.0, "fat_g_100g": 20.0, "source": "base_comum"},
    {"code": "br-batata-frita", "name": "Batata frita", "aliases": "batata frita fritas french fries fast food porcao", "brand": "Base comum", "calories_kcal_100g": 312, "protein_g_100g": 3.4, "carbs_g_100g": 41.0, "fat_g_100g": 15.0, "source": "base_comum"},
    {"code": "br-pizza-mussarela", "name": "Pizza de mussarela", "aliases": "pizza mussarela mozzarella queijo fatia fast food", "brand": "Base comum", "calories_kcal_100g": 266, "protein_g_100g": 11.0, "carbs_g_100g": 33.0, "fat_g_100g": 10.0, "source": "base_comum"},
    {"code": "br-pizza-calabresa", "name": "Pizza de calabresa", "aliases": "pizza calabresa linguica fatia fast food", "brand": "Base comum", "calories_kcal_100g": 295, "protein_g_100g": 12.0, "carbs_g_100g": 31.0, "fat_g_100g": 14.0, "source": "base_comum"},
    {"code": "br-pizza-frango-catupiry", "name": "Pizza de frango com catupiry", "aliases": "pizza frango catupiry requeijao fatia", "brand": "Base comum", "calories_kcal_100g": 280, "protein_g_100g": 13.0, "carbs_g_100g": 30.0, "fat_g_100g": 12.0, "source": "base_comum"},
    {"code": "br-cachorro-quente", "name": "Cachorro-quente", "aliases": "cachorro quente hot dog hotdog salsicha pao lanche fast food", "brand": "Base comum", "calories_kcal_100g": 285, "protein_g_100g": 10.0, "carbs_g_100g": 27.0, "fat_g_100g": 15.0, "source": "base_comum"},
    {"code": "br-nuggets-frango", "name": "Nuggets de frango", "aliases": "nuggets frango empanado fast food", "brand": "Base comum", "calories_kcal_100g": 296, "protein_g_100g": 15.0, "carbs_g_100g": 16.0, "fat_g_100g": 20.0, "source": "base_comum"},
    {"code": "br-pastel-carne", "name": "Pastel de carne", "aliases": "pastel carne feira frito salgado", "brand": "Base comum", "calories_kcal_100g": 330, "protein_g_100g": 10.0, "carbs_g_100g": 34.0, "fat_g_100g": 18.0, "source": "base_comum"},
    {"code": "br-pastel-queijo", "name": "Pastel de queijo", "aliases": "pastel queijo feira frito salgado", "brand": "Base comum", "calories_kcal_100g": 350, "protein_g_100g": 11.0, "carbs_g_100g": 32.0, "fat_g_100g": 21.0, "source": "base_comum"},
    {"code": "br-coxinha-frango", "name": "Coxinha de frango", "aliases": "coxinha frango salgadinho salgado frito festa", "brand": "Base comum", "calories_kcal_100g": 280, "protein_g_100g": 10.0, "carbs_g_100g": 30.0, "fat_g_100g": 13.0, "source": "base_comum"},
    {"code": "br-esfiha-carne", "name": "Esfiha de carne", "aliases": "esfiha esfirra carne salgado", "brand": "Base comum", "calories_kcal_100g": 260, "protein_g_100g": 11.0, "carbs_g_100g": 33.0, "fat_g_100g": 9.0, "source": "base_comum"},
    {"code": "br-kibe-frito", "name": "Kibe frito", "aliases": "kibe quibe frito carne salgado", "brand": "Base comum", "calories_kcal_100g": 290, "protein_g_100g": 12.0, "carbs_g_100g": 23.0, "fat_g_100g": 17.0, "source": "base_comum"},
    {"code": "br-sanduiche-natural-frango", "name": "Sanduiche natural de frango", "aliases": "sanduiche natural frango lanche pao", "brand": "Base comum", "calories_kcal_100g": 190, "protein_g_100g": 12.0, "carbs_g_100g": 24.0, "fat_g_100g": 6.0, "source": "base_comum"},
    {"code": "br-lasanha-bolonhesa", "name": "Lasanha bolonhesa", "aliases": "lasanha bolonhesa massa carne queijo prato pronto", "brand": "Base comum", "calories_kcal_100g": 165, "protein_g_100g": 9.0, "carbs_g_100g": 15.0, "fat_g_100g": 8.0, "source": "base_comum"},
    {"code": "br-macarrao-bolonhesa", "name": "Macarrao a bolonhesa", "aliases": "macarrao bolonhesa massa molho carne prato pronto", "brand": "Base comum", "calories_kcal_100g": 155, "protein_g_100g": 7.0, "carbs_g_100g": 24.0, "fat_g_100g": 4.0, "source": "base_comum"},
    {"code": "br-refrigerante-cola", "name": "Refrigerante cola", "aliases": "refrigerante coca cola bebida soda", "brand": "Base comum", "calories_kcal_100g": 42, "protein_g_100g": 0, "carbs_g_100g": 10.6, "fat_g_100g": 0, "source": "base_comum"},
    {"code": "br-suco-laranja-industrializado", "name": "Suco de laranja industrializado", "aliases": "suco laranja caixinha bebida", "brand": "Base comum", "calories_kcal_100g": 45, "protein_g_100g": 0.6, "carbs_g_100g": 10.5, "fat_g_100g": 0.1, "source": "base_comum"},
    {"code": "br-sorvete-creme", "name": "Sorvete de creme", "aliases": "sorvete creme sobremesa doce", "brand": "Base comum", "calories_kcal_100g": 207, "protein_g_100g": 3.5, "carbs_g_100g": 24.0, "fat_g_100g": 11.0, "source": "base_comum"},
    {"code": "br-brigadeiro", "name": "Brigadeiro", "aliases": "brigadeiro doce festa chocolate", "brand": "Base comum", "calories_kcal_100g": 390, "protein_g_100g": 6.0, "carbs_g_100g": 62.0, "fat_g_100g": 13.0, "source": "base_comum"},
]


STOPWORDS = {"de", "da", "do", "das", "dos", "em", "com", "e", "a", "o", "as", "os"}


def public_food(food: dict[str, object]) -> dict[str, object]:
    return {key: value for key, value in food.items() if key != "aliases"}


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", value.lower())
    return "".join(char for char in value if not unicodedata.combining(char))



def open_food_product_to_item(product: dict[str, object]) -> dict[str, object] | None:
    nutriments = product.get("nutriments") or {}
    if not isinstance(nutriments, dict):
        return None
    name = str(product.get("product_name") or product.get("product_name_pt") or "").strip()
    calories = nutriments.get("energy-kcal_100g") or nutriments.get("energy-kcal") or 0
    if not name or not calories:
        return None
    return {
        "code": product.get("code"),
        "name": name,
        "brand": product.get("brands") or None,
        "calories_kcal_100g": float(calories or 0),
        "protein_g_100g": float(nutriments.get("proteins_100g") or 0),
        "carbs_g_100g": float(nutriments.get("carbohydrates_100g") or 0),
        "fat_g_100g": float(nutriments.get("fat_100g") or 0),
        "source": "open_food_facts",
    }

def search_common_foods(query: str, limit: int) -> list[dict[str, object]]:
    terms = [term for term in normalize_text(query).replace("-", " ").split() if term and term not in STOPWORDS]
    if not terms:
        return []
    ranked = []
    for food in COMMON_FOODS:
        haystack = normalize_text(f"{food['name']} {food['brand']} {food.get('aliases', '')}").replace("-", " ")
        score = sum(2 if term in normalize_text(str(food['name'])) else 1 for term in terms if term in haystack)
        if score:
            ranked.append((score, food))
    ranked.sort(key=lambda item: (-item[0], item[1]["name"]))
    return [public_food(food) for _, food in ranked[:limit]]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": "foods-search-v3"}


@app.post("/goals/calculate", response_model=GoalResponse)
def calculate_goal(payload: GoalRequest) -> dict[str, object]:
    return calculate_targets(**payload.model_dump())


@app.post("/fasting/guidance", response_model=FastingGuidanceResponse)
def fasting_guidance(payload: FastingGuidanceRequest) -> dict[str, object]:
    guidance = build_fasting_guidance(**payload.model_dump())
    return asdict(guidance)


@app.get("/foods/search", response_model=FoodSearchResponse)
def search_foods(q: str, page_size: int = 10) -> dict[str, object]:
    limit = min(max(page_size, 1), 20)
    items = search_common_foods(q, limit)

    params = urlencode({
        "search_terms": q,
        "search_simple": 1,
        "action": "process",
        "json": 1,
        "page_size": limit,
        "fields": "code,product_name,brands,nutriments",
    })
    request = Request(
        f"https://world.openfoodfacts.org/cgi/search.pl?{params}",
        headers={"User-Agent": "NutricaoFitness/0.1 contato@arrumadosvmodas.com"},
    )
    try:
        with urlopen(request, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return {"items": items}

    seen_codes = {item["code"] for item in items}
    for product in payload.get("products", []):
        code = product.get("code")
        item = open_food_product_to_item(product)
        if not item or code in seen_codes:
            continue
        items.append(item)
        seen_codes.add(code)
        if len(items) >= limit:
            break
    return {"items": items[:limit]}


@app.get("/foods/barcode/{code}")
def food_by_barcode(code: str) -> dict[str, object]:
    request = Request(
        f"https://world.openfoodfacts.org/api/v2/product/{code}.json?fields=code,product_name,product_name_pt,brands,nutriments,quantity,serving_size",
        headers={"User-Agent": "NutricaoFitness/0.1 contato@arrumadosvmodas.com"},
    )
    try:
        with urlopen(request, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return {"item": None}
    product = payload.get("product") or {}
    if not isinstance(product, dict):
        return {"item": None}
    item = open_food_product_to_item(product)
    if item:
        item["quantity"] = product.get("quantity") or None
        item["serving_size"] = product.get("serving_size") or None
    return {"item": item}


