import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from urllib.parse import urlparse
import re, time, json

def configurar_driver():
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)

def scrapear():
    url_principal = "http://www.fawanews.sc/list.php"
    
    # EXTRAE EL REFERER DINÁMICAMENTE (Ej: http://www.fawanews.sc/)
    parsed_url = urlparse(url_principal)
    referer_dinamico = f"{parsed_url.scheme}://{parsed_url.netloc}/"
    
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    # Ligas para identificar Fútbol
    ligas_futbol = [
        "PREMIER LEAGUE", "LA LIGA", "SERIE A", "BUNDESLIGA", "LIGUE 1", 
        "CHAMPIONS LEAGUE", "EUROPA LEAGUE", "CONFERENCE LEAGUE", 
        "EREDIVISIE", "ALLSVENSKAN", "PORTUGAL LIGA", "MLS", 
        "LIBERTADORES", "SUDAMERICANA", "FA CUP", "COPA DEL REY",
        "PREMIERSHIP", "CHAMPIONSHIP"
    ]

    try:
        res = requests.get(url_principal, headers=headers, timeout=15)
        res.encoding = 'utf-8'
        soup = BeautifulSoup(res.text, 'html.parser')
    except: return

    partidos_en_vivo = {}
    for link in soup.find_all('a'):
        t = link.get_text().strip()
        h = link.get('href')
        t_up = t.upper()
        
        es_nba = "NBA" in t_up
        es_mlb = "MLB" in t_up
        es_futbol = any(liga in t_up for liga in ligas_futbol)

        if h and (" VS " in t_up) and (es_nba or es_mlb or es_futbol):
            if t not in partidos_en_vivo:
                partidos_en_vivo[t] = h if h.startswith('http') else f"{referer_dinamico}{h}"
    
    if not partidos_en_vivo:
        for f_name in ["nba.json", "mlb.json", "futbol.json"]:
            with open(f_name, "w", encoding="utf-8") as f: json.dump([], f)
        return

    driver = configurar_driver()
    resultados_frescos = []
    
    for nombre, url_partido in partidos_en_vivo.items():
        try:
            driver.get(url_partido)
            time.sleep(12) 
            
            m3u8 = re.findall(r'(https?://[^\s\'"]+\.m3u8[^\s\'"]*)', driver.page_source)
            if m3u8:
                n_up = nombre.upper()
                if "NBA" in n_up: cat = "NBA"
                elif "MLB" in n_up: cat = "MLB"
                else: cat = "FUTBOL"
                
                resultados_frescos.append({
                    "id": re.sub(r'[^a-z0-9]', '-', nombre.lower()).strip('-'),
                    "category": cat,
                    "name": nombre,
                    "url": m3u8[0].replace('\\', ''),
                    "referer": referer_dinamico, # <--- Referer dinámico extraído de la URL
                    "logo": ""
                })
        except: continue
            
    driver.quit()

    # Guardar archivos por separado
    files = { 
        "nba.json": [p for p in resultados_frescos if p['category'] == "NBA"],
        "mlb.json": [p for p in resultados_frescos if p['category'] == "MLB"],
        "futbol.json": [p for p in resultados_frescos if p['category'] == "FUTBOL"]
    }
    
    for filename, data in files.items():
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4, ensure_ascii=False)

if __name__ == "__main__":
    scrapear()
