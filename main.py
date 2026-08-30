(async function() {
    const MAX_KM = 220000;

    const EXCLUDED_LOCATIONS = [
        "gaziantep", "sehitkamil", "şehitkamil", "sahinbey", "şahinbey",
        "bagcilar", "bağcılar",
        "sanliurfa", "şanlıurfa", "urfa", "eyyubiye", "haliliye", "karakopru", "karaköprü",
        "kahramanmaras", "kahramanmaraş", "maras", "maraş", "dulkadiroglu", "dulkadiroğlu", "onikisubat", "onikişubat",
        "diyarbakir", "diyarbakır", "mardin", "batman", "van", "sirnak", "şırnak", "hakkari", "adıyaman", "adiyaman"
    ];

    const EXCLUDED_KEYWORDS = [
        /ticari\s*(geçmişi|çıkması)\s*(?!yok|değil)/i,
        /taksi\s*çıkması\s*(?!yok|değil)/i,
        /ağır\s*hasar(\s*kayıtlı|\s*kaydı\s*var)?\s*(?!yok|değil|bulunmamaktadır)/i,
        /pert\s*kayıtlı\s*(?!yok|değil)/i,
        /sandık\s*motor/i,
        /km\s*düşürülmüş/i
    ];

    // Farklı liste görünümlerini (klasik tablo veya galeri/liste) kapsayan selector
    let rows = Array.from(document.querySelectorAll('tr.searchResultsItem:not(.nativeAd)'));
    if (rows.length === 0) {
        rows = Array.from(document.querySelectorAll('tbody.searchResultsRowClass tr:not(.nativeAd)'));
    }
    if (rows.length === 0) {
        rows = Array.from(document.querySelectorAll('#searchResultsTable tbody tr'));
    }

    console.log(`%c[BİLGİ] Taranacak satır sayısı: ${rows.length}`, 'color: #00ffff; font-weight: bold;');

    if (rows.length === 0) {
        console.error("İlan satırları DOM üzerinde bulunamadı. Lütfen bir arama sonuçları sayfasında olduğunuzdan emin olun.");
        return;
    }

    const filteredListings = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const titleElem = row.querySelector('.searchResultsTitleValue a') || 
                          row.querySelector('a.classifiedTitle') ||
                          row.querySelector('td:nth-child(2) a');
        
        const locElem = row.querySelector('.searchResultsLocationValue') || 
                        row.querySelector('td.searchResultsLocationValue');

        const priceElem = row.querySelector('.searchResultsPriceValue span') || 
                          row.querySelector('.searchResultsPriceValue') ||
                          row.querySelector('td:nth-child(5)');

        const modelElem = row.querySelector('.searchResultsTagAttributeValue');
        const attrElems = row.querySelectorAll('.searchResultsAttributeValue');

        if (!titleElem || !locElem) continue;

        const title = titleElem.innerText.trim();
        const url = titleElem.href;
        const location = locElem.innerText.replace(/\s+/g, ' ').trim();
        const price = priceElem ? priceElem.innerText.replace(/\s+/g, ' ').trim() : 'N/A';
        const model = modelElem ? modelElem.innerText.trim() : '';
        const year = attrElems[0] ? attrElems[0].innerText.trim() : '';
        const kmStr = attrElems[1] ? attrElems[1].innerText.trim() : '';

        // KM Kontrolü
        const kmNum = parseInt(kmStr.replace(/\D/g, ''), 10);
        if (!isNaN(kmNum) && kmNum > MAX_KM) {
            console.log(`%c[-] KM Sınırı Aşıldı (${kmNum} km): ${title}`, 'color: #888888;');
            continue;
        }

        // Lokasyon Kontrolü
        const locLower = location.toLowerCase();
        const isExcludedLoc = EXCLUDED_LOCATIONS.some(loc => locLower.includes(loc));
        if (isExcludedLoc) {
            console.log(`%c[-] Lokasyon Elendi (${location}): ${title}`, 'color: #ff5555;');
            continue;
        }

        // Açıklama Detayı Kontrolü (Fetch)
        try {
            console.log(`[*] Kontrol ediliyor (${i + 1}/${rows.length}): ${title}`);
            const response = await fetch(url, { credentials: 'include' });
            const htmlText = await response.text();
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, 'text/html');
            const descElem = doc.querySelector('#classifiedDescription');
            const description = descElem ? descElem.innerText.trim() : '';

            const isExcludedDesc = EXCLUDED_KEYWORDS.some(regex => regex.test(description));

            if (isExcludedDesc) {
                console.log(`%c[-] Açıklama kriterine takıldı: ${title}`, 'color: #ffaa00;');
            } else {
                console.log(`%c[✓] UYGUN İLAN: ${title} | ${price} | ${kmStr} | ${location}`, 'color: #00ff00; font-weight: bold;');
                filteredListings.push({
                    title,
                    model,
                    year,
                    km: kmStr,
                    price,
                    location,
                    url
                });
            }

            // Güvenli bekleme (Sayfa başına ~20 ilan için toplam işlem yaklaşık 25-30 saniye sürer)
            await new Promise(r => setTimeout(r, 1200));

        } catch (e) {
            console.warn(`[!] İlan okunamadı: ${url}`, e);
        }
    }

    if (filteredListings.length === 0) {
        console.warn('Filtreleri geçen uygun ilan bulunamadı.');
        return;
    }

    // CSV İndirme
    const headers = ["İlan Başlığı", "Model", "Yıl", "KM", "Fiyat", "Konum", "İlan Linki"];
    const csvRows = [headers.join(";")];

    filteredListings.forEach(item => {
        const row = [
            `"${item.title.replace(/"/g, '""')}"`,
            `"${item.model.replace(/"/g, '""')}"`,
            `"${item.year}"`,
            `"${item.km}"`,
            `"${item.price}"`,
            `"${item.location.replace(/"/g, '""')}"`,
            `"${item.url}"`
        ];
        csvRows.push(row.join(";"));
    });

    const csvContent = "\uFEFF" + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `arac_piyasa_analizi_${Date.now()}.csv`;
    link.click();

    console.log(`%c[TAMAMLANDI] ${filteredListings.length} uygun araç CSV olarak indirildi.`, 'color: #00ffff; font-size: 14px; font-weight: bold;');
})();