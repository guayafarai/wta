import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
import re, time, json

def configurar_driver():
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    # Agregamos un user-agent para que no nos bloqueen en la nube
    chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)

def scrapear():
    url_base = "http://www.fawanews.sc/list.php"
    
    # 1. Obtener la lista de partidos ACTUALES
    try:
        res = requests.get(url_base, timeout=15)
        res.encoding = 'utf-8'
        soup = BeautifulSoup(res.text, 'html.parser')
    except:
        print("Error al conectar con la web")
        return

    partidos_en_vivo = {}
    for link in soup.find_all('a'):
        t = link.get_text().strip()
        h = link.get('href')
        t_up = t.upper()
        
        # Filtramos solo NBA/MLB que tengan "VS" (partidos reales)
        if h and ("NBA" in t_up or "MLB" in t_up) and (" VS " in t_up):
            if t not in partidos_en_vivo:
                partidos_en_vivo[t] = h if h.startswith('http') else f"http://www.fawanews.sc/{h}"
    
    # 2. Si no hay partidos, limpiamos los JSON y salimos
    if not partidos_en_vivo:
        with open("nba.json", "w") as f: json.dump([], f)
        with open("mlb.json", "w") as f: json.dump([], f)
        print("No hay partidos activos. Archivos limpiados.")
        return

    # 3. Extraer links m3u8 de los partidos encontrados
    driver = configurar_driver()
    resultados_frescos = []
    
    for nombre, url_partido in partidos_en_vivo.items():
        try:
            driver.get(url_partido)
            time.sleep(12) # Tiempo para que cargue el reproductor
            
            # Buscar el stream .m3u8
            m3u8 = re.findall(r'(https?://[^\s\'"]+\.m3u8[^\s\'"]*)', driver.page_source)
            if m3u8:
                resultados_frescos.append({
                    "id": re.sub(r'[^a-z0-9]', '-', nombre.lower()).strip('-'),
                    "name": nombre,
                    "url": m3u8[0].replace('\\', ''),
                    "logo": ""
                })
        except:
            continue
            
    driver.quit()

    # 4. SEPARAR Y SOBREESCRIBIR (Esto elimina los partidos viejos)
    nba_final = [p for p in resultados_frescos if "NBA" in p['name'].upper()]
    mlb_final = [p for p in resultados_frescos if "MLB" in p['name'].upper()]
    
    # Al usar "w" (write), el archivo anterior se borra por completo
    with open("nba.json", "w", encoding="utf-8") as f:
        json.dump(nba_final, f, indent=4, ensure_ascii=False)
    
    with open("mlb.json", "w", encoding="utf-8") as f:
        json.dump(mlb_final, f, indent=4, ensure_ascii=False)
        
    print(f"Scraping terminado. NBA: {len(nba_final)} | MLB: {len(mlb_final)}")

if __name__ == "__main__":
    scrapear()
