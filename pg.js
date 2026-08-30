(async function() {
    // === CFG ===
    const MAX_PAGES = 50;        
    const MAX_KM = 220000;
    const DELAY_MS = 1000;       // WAF Protect

    // Normalization
    const EXCLUDED_LOCATIONS = [
        "gaziantep", "sehitkamil", "şehitkamil", "sahinbey", "şahinbey",
        "bagcilar", "bağcılar",
        "sanliurfa", "şanlıurfa", "urfa", "eyyubiye", "haliliye", "karakopru", "karaköprü",
        "kahramanmaras", "kahramanmaraş", "maras", "maraş", "dulkadiroglu", "dulkadiroğlu", "onikisubat", "onikişubat",
        "diyarbakir", "diyarbakır", "mardin", "batman", "van", "sirnak", "şırnak", "hakkari", "adiyaman", "adıyaman"
    ];

    const EXCLUDED_KEYWORDS = [
        /ticari\s*(ge[cç]mi[sş]i|[cç][iı]kmas[iı]|kayd[iı])\s*(?!yok|de[gğ]il|bulunmamaktad[iı]r)/i,
        /taksi\s*([cç][iı]kmas[iı]|ge[cç]mi[sş]i|olarak\s*kullan[iı]lm[iı][sş])\s*(?!yok|de[gğ]il|bulunmamaktad[iı]r)/i,
        /sar[iı]\s*kaplama/i,
        /taksi\s*rengi/i,
        /a[gğ][iı]r\s*hasar(\s*kay[iı]tl[iı]|\s*kayd[iı]\s*var|\s*ge[cç]mektedir)?\s*(?!yok|de[gğ]il|bulunmamaktad[iı]r)/i,
        /pert(\s*kay[iı]tl[iı]|\s*kayd[iı]\s*var|\s*ge[cç]mektedir)?\s*(?!yok|de[gğ]il|bulunmamaktad[iı]r)/i,
        /sand[iı]k\s*motor/i,
        /motor\s*(yap[iı]ld[iı]|s[iı]f[iı]rland[iı]|revizyon\s*g[oö]rd[uü]|yeni\s*kondu)/i,
        /km\s*(d[uü][sş][uü]r[uü]lm[uü][sş]|orijinal\s*de[gğ]il|oynanm[iı][sş])/i,
        /hasar\s*kay[iı]tl[iı]\s*(?!yok|de[gğ]il|bulunmamaktad[iı]r)/i
    ];

    const cleanText = (str) => str ? str.replace(/\s+/g, ' ').trim() : '';

    const results = [];
    const baseUrl = window.location.href.split('?')[0];
    const urlParams = new URLSearchParams(window.location.search);

    console.log("%c[BAŞLADI] Araç piyasa tarama robotu çalıştırıldı...", "color: #00ffc8; font-size: 14px; font-weight: bold;");

    for (let page = 0; page < MAX_PAGES; page++) {
        const offset = page * 50;
        urlParams.set('pagingOffset', offset);
        urlParams.set('pagingSize', '50');
        const targetPageUrl = `${baseUrl}?${urlParams.toString()}`;

        console.log(`%c\n--- SAYFA ${page + 1}/${MAX_PAGES} İŞLENİYOR ---`, 'color: #ffc83b; font-weight: bold;');

        let doc;
        if (page === 0) {
            doc = document;
        } else {
            try {
                const res = await fetch(targetPageUrl, { credentials: 'include' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const html = await res.text();
                const parser = new DOMParser();
                doc = parser.parseFromString(html, 'text/html');
                await new Promise(r => setTimeout(r, 1500));
            } catch (err) {
                console.error(`[!] Sayfa ${page + 1} getirilemedi:`, err);
                break;
            }
        }

        let rows = Array.from(doc.querySelectorAll('tr.searchResultsItem:not(.nativeAd)'));
        if (rows.length === 0) {
            rows = Array.from(doc.querySelectorAll('tbody.searchResultsRowClass tr:not(.nativeAd)'));
        }

        if (rows.length === 0) {
            console.warn(`[*] Taranacak başka ilan bulunamadı. Toplam ${page} sayfa tarandı.`);
            break;
        }

        console.log(`[*] Bu sayfada ${rows.length} adet ilan bulundu. Filtreler uygulanıyor...`);

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            const titleElem = row.querySelector('.searchResultsTitleValue a') || row.querySelector('a.classifiedTitle');
            const locElem = row.querySelector('.searchResultsLocationValue');
            const priceElem = row.querySelector('.searchResultsPriceValue span') || row.querySelector('.searchResultsPriceValue');
            const dateElem = row.querySelector('.searchResultsDateValue');
            const attrElems = row.querySelectorAll('.searchResultsAttributeValue'); // Genelde [0]: Yıl, [1]: KM
            const tagElems = row.querySelectorAll('.searchResultsTagAttributeValue'); // Marka / Model tagleri

            if (!titleElem || !locElem) continue;

            const title = cleanText(titleElem.innerText);
            const href = titleElem.getAttribute('href') || '';
            const detailUrl = href.startsWith('http') ? href : `https://www.sahibinden.com${href}`;
            const location = cleanText(locElem.innerText);
            const price = priceElem ? cleanText(priceElem.innerText) : 'N/A';
            const date = dateElem ? cleanText(dateElem.innerText) : '';
            const year = attrElems[0] ? cleanText(attrElems[0].innerText) : '';
            const kmStr = attrElems[1] ? cleanText(attrElems[1].innerText) : '';

            // Marka, Seri, Model Parsing
            let brand = '', series = '', model = '';
            if (tagElems.length >= 3) {
                brand = cleanText(tagElems[0].innerText);
                series = cleanText(tagElems[1].innerText);
                model = cleanText(tagElems[2].innerText);
            } else if (tagElems.length > 0) {
                const parts = cleanText(tagElems[0].innerText).split(/\s+/);
                brand = parts[0] || '';
                series = parts[1] || '';
                model = parts.slice(2).join(' ') || '';
            }

            // 1. KM Kontrolü
            const kmNum = parseInt(kmStr.replace(/\D/g, ''), 10);
            if (!isNaN(kmNum) && kmNum > MAX_KM) {
                continue;
            }

            // 2. Lokasyon Kontrolü
            const locLower = location.toLowerCase();
            const isExcludedLocation = EXCLUDED_LOCATIONS.some(loc => locLower.includes(loc));
            if (isExcludedLocation) {
                continue;
            }

            // 3. Başlık Kontrolü
            const isTitleExcluded = EXCLUDED_KEYWORDS.some(rx => rx.test(title));
            if (isTitleExcluded) {
                continue;
            }

            // 4. İlan Detay Açıklaması Kontrolü
            try {
                const response = await fetch(detailUrl, { credentials: 'include' });
                const htmlText = await response.text();
                const parser = new DOMParser();
                const detailDoc = parser.parseFromString(htmlText, 'text/html');
                const descElem = detailDoc.querySelector('#classifiedDescription');
                const description = descElem ? cleanText(descElem.innerText) : '';

                // İlan detayından marka/model eksikse tamamlama
                if (!brand || !series) {
                    const breadcrumbLinks = Array.from(detailDoc.querySelectorAll('.classifiedDetailBreadcrumb li a'));
                    if (breadcrumbLinks.length >= 4) {
                        brand = cleanText(breadcrumbLinks[2]?.innerText);
                        series = cleanText(breadcrumbLinks[3]?.innerText);
                        model = cleanText(breadcrumbLinks[4]?.innerText);
                    }
                }

                const isDescExcluded = EXCLUDED_KEYWORDS.some(rx => rx.test(description));

                if (!isDescExcluded) {
                    results.push({
                        brand,
                        series,
                        model,
                        title,
                        year,
                        km: kmStr,
                        price,
                        date,
                        location
                    });
                    console.log(`%c[✓ UYGUN (${results.length})] ${brand} ${series} | ${price} | ${kmStr} | ${location}`, 'color: #00ff77;');
                } else {
                    console.log(`%c[-] Açıklamadan elendi: ${title}`, 'color: #888888;');
                }

                await new Promise(r => setTimeout(r, DELAY_MS));
            } catch (fetchErr) {
                console.warn(`[!] Detay alınamadı (${detailUrl}):`, fetchErr);
            }
        }
    }

    if (results.length === 0) {
        console.warn('Hiçbir uygun araç bulunamadı.');
        return;
    }

    // === CSV ÇIKTISI OLUŞTURMA ===
    const headers = ["Marka", "Seri", "Model", "İlan Başlığı", "Yıl", "KM", "Fiyat", "İlan Tarihi", "İl / İlçe"];
    const csvLines = [headers.join(";")];

    results.forEach(item => {
        const line = [
            `"${item.brand.replace(/"/g, '""')}"`,
            `"${item.series.replace(/"/g, '""')}"`,
            `"${item.model.replace(/"/g, '""')}"`,
            `"${item.title.replace(/"/g, '""')}"`,
            `"${item.year}"`,
            `"${item.km}"`,
            `"${item.price}"`,
            `"${item.date.replace(/"/g, '""')}"`,
            `"${item.location.replace(/"/g, '""')}"`
        ];
        csvLines.push(line.join(";"));
    });

    const csvBlob = new Blob(["\uFEFF" + csvLines.join("\n")], { type: 'text/csv;charset=utf-8;' });
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = URL.createObjectURL(csvBlob);
    downloadAnchor.download = `kapsamli_piyasa_arac_verisi_${Date.now()}.csv`;
    downloadAnchor.click();

    console.log(`%c\n[İŞLEM TAMAMLANDI] Toplam ${results.length} adet filtrelenmiş temiz araç CSV olarak indirildi!`, 'color: #00ffff; font-size: 16px; font-weight: bold;');
})();