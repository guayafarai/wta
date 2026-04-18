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
    return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)

def scrapear():
    url = "http://www.fawanews.sc/list.php"
    try:
        res = requests.get(url, timeout=10)
        soup = BeautifulSoup(res.text, 'html.parser')
        partidos = {}
        for link in soup.find_all('a'):
            t = link.get_text().strip()
            h = link.get('href')
            t_up = t.upper()
            if h and ("NBA" in t_up or "MLB" in t_up) and (" VS " in t_up):
                if t not in partidos:
                    partidos[t] = h if h.startswith('http') else f"http://www.fawanews.sc/{h}"

        if not partidos: return

        driver = configurar_driver()
        resultados = []
        for nombre, link_url in partidos.items():
            try:
                driver.get(link_url)
                time.sleep(10)
                m3u8 = re.findall(r'(https?://[^\s\'"]+\.m3u8[^\s\'"]*)', driver.page_source)
                if m3u8:
                    resultados.append({
                        "id": re.sub(r'[^a-z0-9]', '-', nombre.lower()).strip('-'),
                        "name": nombre,
                        "url": m3u8[0].replace('\\', ''),
                        "logo": ""
                    })
            except: continue
        driver.quit()

        nba = [p for p in resultados if "NBA" in p['name'].upper()]
        mlb = [p for p in resultados if "MLB" in p['name'].upper()]

        with open("nba.json", "w", encoding="utf-8") as f: json.dump(nba, f, indent=4, ensure_ascii=False)
        with open("mlb.json", "w", encoding="utf-8") as f: json.dump(mlb, f, indent=4, ensure_ascii=False)
    except: pass

if __name__ == "__main__":
    scrapear()
