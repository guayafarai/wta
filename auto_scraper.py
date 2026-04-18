import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
import re, time, json

def configurar_driver():
    chrome_options = Options()
    # Configuraciones esenciales para correr en servidores de GitHub
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    # User-Agent para simular un navegador real y evitar bloqueos
    chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    
    service = Service(ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=chrome_options)

def scrapear():
    url_base = "http://www.fawanews.sc/list.php"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    
    print("🛰️ Obteniendo lista de partidos...")
    try:
        res = requests.get(url_base, headers=headers, timeout=15)
        res.encoding = 'utf-8'
        soup = BeautifulSoup(res.text, 'html.parser')
    except Exception as e:
        print(f"❌ Error de conexión: {e}")
        return

    partidos_en_vivo = {}
    for link in soup.find_all('a'):
        t = link.get_text().strip()
        h = link.get('href')
        t_up = t.upper()
        
        # Filtro: Solo NBA/MLB con enfrentamientos reales (VS)
        if h and ("NBA" in t_up or "MLB" in t_up) and (" VS " in t_up):
            if t not in partidos_en_vivo:
                partidos_en_vivo[t] = h if h.startswith('http') else f"http://www.fawanews.sc/{h}"
    
    if not partidos_en_vivo:
        print("📭 No hay partidos activos. Limpiando archivos...")
        with open("nba.json", "w", encoding="utf-8") as f: json.dump([], f)
        with open("mlb.json", "w", encoding="utf-8") as f: json.dump([], f)
        return

    print(f"✅ Encontrados {len(partidos_en_vivo)} partidos. Extrayendo links...")
    driver = configurar_driver()
    resultados_frescos = []
    
    for nombre, url_partido in partidos_en_vivo.items():
        try:
            print(f"🔍 Analizando: {nombre}")
            driver.get(url_partido)
            # Espera prudente para que cargue el reproductor JS
            time.sleep(12) 
            
            # Busqueda de links m3u8
            m3u8 = re.findall(r'(https?://[^\s\'"]+\.m3u8[^\s\'"]*)', driver.page_source)
            if m3u8:
                # Limpiar link y crear objeto con formato solicitado
                link_directo = m3u8[0].replace('\\', '')
                id_generado = re.sub(r'[^a-z0-9]', '-', nombre.lower()).strip('-')
                
                resultados_frescos.append({
                    "id": id_generado,
                    "name": nombre,
                    "url": link_directo,
                    "logo": ""
                })
                print("   🎯 Link encontrado!")
            else:
                print("   ❌ No se detectó señal.")
        except Exception as e:
            print(f"   ⚠️ Error en este partido: {e}")
            continue
            
    driver.quit()

    # SEPARAR POR LIGA Y GUARDAR
    nba_final = [p for p in resultados_frescos if "NBA" in p['name'].upper()]
    mlb_final = [p for p in resultados_frescos if "MLB" in p['name'].upper()]
    
    # Sobrescribir archivos (esto elimina los partidos terminados automáticamente)
    with open("nba.json", "w", encoding="utf-8") as f:
        json.dump(nba_final, f, indent=4, ensure_ascii=False)
    
    with open("mlb.json", "w", encoding="utf-8") as f:
        json.dump(mlb_final, f, indent=4, ensure_ascii=False)
        
    print(f"\n🚀 Proceso terminado con éxito.")
    print(f"📊 Resumen: NBA ({len(nba_final)}) | MLB ({len(mlb_final)})")

if __name__ == "__main__":
    scrapear()
