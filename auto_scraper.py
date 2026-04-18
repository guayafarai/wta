import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
import re, time, json

def configurar_driver():
    chrome_options = Options()
    # Configuraciones críticas para el servidor de GitHub (entorno Linux)
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    # Simula un navegador real para evitar bloqueos
    chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    
    service = Service(ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=chrome_options)

def scrapear():
    url_base = "http://www.fawanews.sc/list.php"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    
    print("🛰️ Iniciando conexión con FawaNews...")
    try:
        res = requests.get(url_base, headers=headers, timeout=15)
        res.encoding = 'utf-8'
        soup = BeautifulSoup(res.text, 'html.parser')
    except Exception as e:
        print(f"❌ Error al conectar: {e}")
        return

    # 1. Identificar partidos únicos que sean NBA o MLB y tengan "VS"
    partidos_en_vivo = {}
    for link in soup.find_all('a'):
        t = link.get_text().strip()
        h = link.get('href')
        t_up = t.upper()
        
        if h and ("NBA" in t_up or "MLB" in t_up) and (" VS " in t_up):
            if t not in partidos_en_vivo:
                partidos_en_vivo[t] = h if h.startswith('http') else f"http://www.fawanews.sc/{h}"
    
    # Si no hay partidos, dejamos los archivos vacíos y terminamos
    if not partidos_en_vivo:
        print("📭 No hay partidos activos ahora. Limpiando archivos .json")
        with open("nba.json", "w", encoding="utf-8") as f: json.dump([], f)
        with open("mlb.json", "w", encoding="utf-8") as f: json.dump([], f)
        return

    print(f"✅ Se encontraron {len(partidos_en_vivo)} partidos. Extrayendo señales...")
    driver = configurar_driver()
    resultados_frescos = []
    
    # 2. Navegar a cada partido para capturar el link .m3u8
    for nombre, url_partido in partidos_en_vivo.items():
        try:
            print(f"🔍 Analizando: {nombre}")
            driver.get(url_partido)
            # Espera necesaria para que cargue el reproductor y el link m3u8 aparezca
            time.sleep(12) 
            
            # Buscar patrones de links m3u8 en el código fuente
            links_encontrados = re.findall(r'(https?://[^\s\'"]+\.m3u8[^\s\'"]*)', driver.page_source)
            
            if links_encontrados:
                link_limpio = links_encontrados[0].replace('\\', '')
                categoria = "NBA" if "NBA" in nombre.upper() else "MLB"
                id_slug = re.sub(r'[^a-z0-9]', '-', nombre.lower()).strip('-')
                
                resultados_frescos.append({
                    "id": id_slug,
                    "category": categoria,
                    "name": nombre,
                    "url": link_limpio,
                    "logo": ""
                })
                print(f"   🎯 Link capturado para {categoria}")
            else:
                print("   ❌ No se detectó señal m3u8.")
        except Exception as e:
            print(f"   ⚠️ Error procesando este partido: {e}")
            continue
            
    driver.quit()

    # 3. Filtrar por categoría
    nba_data = [p for p in resultados_frescos if p['category'] == "NBA"]
    mlb_data = [p for p in resultados_frescos if p['category'] == "MLB"]
    
    # 4. Sobrescribir archivos (esto elimina automáticamente los partidos terminados)
    with open("nba.json", "w", encoding="utf-8") as f:
        json.dump(nba_data, f, indent=4, ensure_ascii=False)
    
    with open("mlb.json", "w", encoding="utf-8") as f:
        json.dump(mlb_data, f, indent=4, ensure_ascii=False)
        
    print(f"\n📊 RESUMEN FINAL:")
    print(f"🏀 NBA: {len(nba_data)} activos")
    print(f"⚾ MLB: {len(mlb_data)} activos")
    print("📁 Archivos actualizados en el repositorio.")

if __name__ == "__main__":
    scrapear()
