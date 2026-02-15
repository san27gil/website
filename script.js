let portfolio = {};
let apiKey = localStorage.getItem('alphaVantageApiKey') || '';
let usdToEurRate = 0.92;
let fxHistory = null;

// Inicializar
if (apiKey) {
    document.getElementById('apiKeySetup').style.display = 'none';
    loadPortfolio();
    updateExchangeRate();
}

function saveApiKey() {
    const key = document.getElementById('apiKeyInput').value.trim();
    if (key) {
        apiKey = key;
        localStorage.setItem('alphaVantageApiKey', key);
        document.getElementById('apiKeySetup').style.display = 'none';
        showError('');
        loadPortfolio();
        updateExchangeRate();
    }
}

async function updateExchangeRate() {
    try {
        const response = await fetch(
            `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=USD&to_currency=EUR&apikey=${apiKey}`
        );
        const data = await response.json();
        
        if (data['Realtime Currency Exchange Rate']) {
            usdToEurRate = parseFloat(data['Realtime Currency Exchange Rate']['5. Exchange Rate']);
            console.log(`Tasa de cambio actualizada: 1 USD = ${usdToEurRate.toFixed(4)} EUR`);
        }
    } catch (error) {
        console.error('Error al obtener tasa de cambio:', error);
    }
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    if (message) {
        errorDiv.className = 'error';
        errorDiv.textContent = message;
    } else {
        errorDiv.className = '';
        errorDiv.textContent = '';
    }
}

function loadPortfolio() {
    const saved = localStorage.getItem('portfolio');
    if (saved) {
        const oldPortfolio = JSON.parse(saved);
        
        // Migrar datos antiguos si es necesario
        if (Array.isArray(oldPortfolio)) {
            portfolio = {};
            oldPortfolio.forEach(stock => {
                if (!portfolio[stock.symbol]) {
                    portfolio[stock.symbol] = {
                        symbol: stock.symbol,
                        currency: stock.currency || 'USD',
                        currentPrice: stock.currentPrice || 0,
                        currentPriceOriginal: stock.currentPriceOriginal || 0,
                        lots: []
                    };
                }
                portfolio[stock.symbol].lots.push({
                    shares: stock.shares,
                    purchasePrice: stock.purchasePrice,
                    purchaseDate: stock.purchaseDate,
                    id: Date.now() + Math.random()
                });
            });
        } else {
            portfolio = oldPortfolio;
        }
        
        updatePortfolio();
    }
}

function savePortfolio() {
    localStorage.setItem('portfolio', JSON.stringify(portfolio));
}

async function getExchangeRateForDate(dateStr) {
    if (!fxHistory) {
        try {
            // Obtener historial completo de divisas (se hace solo una vez)
            const response = await fetch(`https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=USD&to_symbol=EUR&outputsize=full&apikey=${apiKey}`);
            const data = await response.json();
            if (data['Time Series FX (Daily)']) {
                fxHistory = data['Time Series FX (Daily)'];
            }
        } catch (e) {
            console.error("Error obteniendo historial de divisas:", e);
        }
    }
    
    // Buscar la fecha exacta o la más cercana anterior
    if (fxHistory) {
        // Si la fecha existe, devolverla. Si no (fin de semana), la API suele manejarlo, pero por seguridad podríamos buscar hacia atrás.
        // Por simplicidad, intentamos acceso directo o fallback al actual.
        if (fxHistory[dateStr]) return parseFloat(fxHistory[dateStr]['4. close']);
        
        // Intento simple de buscar días anteriores si es fin de semana
        let d = new Date(dateStr);
        for(let i=0; i<5; i++) {
            d.setDate(d.getDate() - 1);
            const iso = d.toISOString().split('T')[0];
            if (fxHistory[iso]) return parseFloat(fxHistory[iso]['4. close']);
        }
    }
    
    return usdToEurRate; // Fallback al actual si falla
}

async function addStock() {
    const symbol = document.getElementById('symbolInput').value.toUpperCase().trim();
    const shares = parseFloat(document.getElementById('sharesInput').value);
    const price = parseFloat(document.getElementById('priceInput').value);
    const currency = document.getElementById('currencyInput').value;
    const date = document.getElementById('dateInput').value;

    if (!symbol || !shares || !price || !date) {
        showError('Por favor, rellena todos los campos');
        return;
    }

    if (!apiKey) {
        showError('Por favor, configura tu API key primero');
        return;
    }

    // Si el sí­mbolo no existe, crear entrada nueva
    if (!portfolio[symbol]) {
        portfolio[symbol] = {
            symbol: symbol,
            currency: currency,
            currentPrice: 0,
            currentPriceOriginal: 0,
            lots: []
        };
    }

    let exchangeRate = 1;
    if (currency === 'USD') {
        exchangeRate = await getExchangeRateForDate(date);
    }

    // Añadir nuevo lote
    portfolio[symbol].lots.push({
        shares: shares,
        purchasePrice: price,
        purchaseDate: date,
        exchangeRate: exchangeRate,
        id: Date.now() + Math.random()
    });

    // Ordenar lotes por fecha (FIFO)
    portfolio[symbol].lots.sort((a, b) => new Date(a.purchaseDate) - new Date(b.purchaseDate));

    savePortfolio();
    
    // Limpiar formulario
    document.getElementById('symbolInput').value = '';
    document.getElementById('sharesInput').value = '';
    document.getElementById('priceInput').value = '';
    document.getElementById('dateInput').value = '';

    await updatePortfolio();
}

function deleteLot(symbol, lotId) {
    if (portfolio[symbol]) {
        portfolio[symbol].lots = portfolio[symbol].lots.filter(lot => lot.id !== lotId);
        
        // Si no quedan lotes, eliminar el símbolo
        if (portfolio[symbol].lots.length === 0) {
            delete portfolio[symbol];
        }
        
        savePortfolio();
        updatePortfolio();
    }
}

function toggleLotDetails(symbol) {
    const detailsRow = document.getElementById(`details-${symbol}`);
    const mainRow = document.getElementById(`main-${symbol}`);
    
    if (detailsRow && mainRow) {
        detailsRow.classList.toggle('visible');
        mainRow.classList.toggle('expanded');
    }
}

async function updatePortfolio() {
    const symbols = Object.keys(portfolio);
    
    if (symbols.length === 0) {
        document.getElementById('holdingsBody').innerHTML = 
            '<tr><td colspan="8" class="loading">No hay posiciones todavía. Añade tu primera posición arriba.</td></tr>';
        updateStats();
        return;
    }

    // Obtener precios actuales para todos los sí­mbolos
    const promises = symbols.map(async symbol => {
        const currentPrice = await fetchStockPrice(symbol);
        return { symbol, currentPrice };
    });
    
    const results = await Promise.all(promises);

    results.forEach(({ symbol, currentPrice }) => {
        if (currentPrice !== null && portfolio[symbol]) {
            if (portfolio[symbol].currency === 'USD') {
                portfolio[symbol].currentPrice = currentPrice * usdToEurRate;
                portfolio[symbol].currentPriceOriginal = currentPrice;
            } else {
                portfolio[symbol].currentPrice = currentPrice;
                portfolio[symbol].currentPriceOriginal = currentPrice;
            }
        }
    });

    savePortfolio();
    renderHoldings();
    updateStats();
}

async function fetchStockPrice(symbol) {
    try {
        const response = await fetch(
            `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`
        );
        const data = await response.json();
        
        if (data['Global Quote'] && data['Global Quote']['05. price']) {
            return parseFloat(data['Global Quote']['05. price']);
        }
        
        if (data.Note) {
            showError('Lí­mite de la API alcanzado. Por favor, espera un minuto.');
        }
        
        return null;
    } catch (error) {
        console.error(`Error al obtener ${symbol}:`, error);
        return null;
    }
}

function formatEuro(amount) {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

function formatPercent(value) {
    return new Intl.NumberFormat('es-ES', {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value / 100);
}

function renderHoldings() {
    const tbody = document.getElementById('holdingsBody');
    const symbols = Object.keys(portfolio);
    
    if (symbols.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">No hay posiciones todavía. Añade tu primera posición arriba.</td></tr>';
        return;
    }

    let html = '';

    symbols.forEach(symbol => {
        const stock = portfolio[symbol];
        
        // Calcular totales agregados
        const totalShares = stock.lots.reduce((sum, lot) => sum + lot.shares, 0);
        
        // Precio medio ponderado
        const totalCostOriginal = stock.lots.reduce((sum, lot) => sum + (lot.shares * lot.purchasePrice), 0);
        const avgPurchasePrice = totalShares > 0 ? totalCostOriginal / totalShares : 0;
        
        // Coste total REAL en EUR (usando el tipo de cambio de cada compra)
        const totalCostInEur = stock.lots.reduce((sum, lot) => {
            const rate = lot.exchangeRate || (stock.currency === 'USD' ? usdToEurRate : 1);
            return sum + (lot.shares * lot.purchasePrice * rate);
        }, 0);
        
        const avgPurchasePriceInEur = totalShares > 0 ? totalCostInEur / totalShares : 0;
        
        const currentPriceInEur = stock.currentPrice;
        
        // Valores totales en EUR
        const marketValue = totalShares * currentPriceInEur;
        const costBasis = totalShares * avgPurchasePriceInEur;
        const gainLoss = marketValue - costBasis;
        const returnPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

        // Precio medio para mostrar
        const avgPriceDisplay = stock.currency === 'USD' 
            ? `$${avgPurchasePrice.toFixed(2)}` 
            : formatEuro(avgPurchasePrice);
        
        // Precio actual para mostrar
        const currentPriceDisplay = stock.currency === 'USD' && stock.currentPriceOriginal
            ? `$${stock.currentPriceOriginal.toFixed(2)}`
            : formatEuro(stock.currentPrice);

        // Fila principal (agregada)
        html += `
            <tr id="main-${symbol}" class="expandable-row" onclick="toggleLotDetails('${symbol}')">
                <td style="font-weight: 500;">
                    ${symbol}
                    ${stock.lots.length > 1 ? `<span style="color: var(--muted); font-size: 0.75rem; font-weight: 400;">(${stock.lots.length} operaciones)</span>` : ''}
                </td>
                <td>${totalShares.toFixed(2)}</td>
                <td>${avgPriceDisplay}</td>
                <td>${currentPriceDisplay}</td>
                <td>${formatEuro(marketValue)}</td>
                <td class="${gainLoss >= 0 ? 'positive' : 'negative'}">
                    ${gainLoss >= 0 ? '+' : ''}${formatEuro(gainLoss)}
                </td>
                <td class="${returnPercent >= 0 ? 'positive' : 'negative'}">
                    ${returnPercent >= 0 ? '+' : ''}${formatPercent(returnPercent)}
                </td>
                <td></td>
            </tr>
        `;

        // Fila de detalles (lotes individuales)
        if (stock.lots.length > 0) {
            html += `
                <tr id="details-${symbol}" class="lot-details-row">
                    <td colspan="8" class="lot-details-cell">
                        <table class="lot-details-table">
                            <thead>
                                <tr>
                                    <th>Fecha Compra</th>
                                    <th>Acciones</th>
                                    <th>Precio Compra</th>
                                    <th>Coste Total</th>
                                    <th>Valor Actual</th>
                                    <th>Ganancia/Pérdida</th>
                                    <th>Retorno %</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            stock.lots.forEach((lot) => {
                const lotExchangeRate = lot.exchangeRate || (stock.currency === 'USD' ? usdToEurRate : 1);
                const lotPurchasePriceInEur = stock.currency === 'USD' 
                    ? lot.purchasePrice * lotExchangeRate 
                    : lot.purchasePrice;
                
                const lotCostBasis = lot.shares * lotPurchasePriceInEur;
                const lotMarketValue = lot.shares * currentPriceInEur;
                const lotGainLoss = lotMarketValue - lotCostBasis;
                const lotReturnPercent = lotCostBasis > 0 ? (lotGainLoss / lotCostBasis) * 100 : 0;

                const lotPriceDisplay = stock.currency === 'USD' 
                    ? `$${lot.purchasePrice.toFixed(2)}` 
                    : formatEuro(lot.purchasePrice);

                html += `
                    <tr>
                        <td>${new Date(lot.purchaseDate).toLocaleDateString('es-ES')}</td>
                        <td>${lot.shares.toFixed(2)}</td>
                        <td>${lotPriceDisplay}</td>
                        <td>${formatEuro(lotCostBasis)}</td>
                        <td>${formatEuro(lotMarketValue)}</td>
                        <td class="${lotGainLoss >= 0 ? 'positive' : 'negative'}">
                            ${lotGainLoss >= 0 ? '+' : ''}${formatEuro(lotGainLoss)}
                        </td>
                        <td class="${lotReturnPercent >= 0 ? 'positive' : 'negative'}">
                            ${lotReturnPercent >= 0 ? '+' : ''}${formatPercent(lotReturnPercent)}
                        </td>
                        <td>
                            <button class="delete-btn" onclick="event.stopPropagation(); deleteLot('${symbol}', ${lot.id})">Eliminar</button>
                        </td>
                    </tr>
                `;
            });

            html += `
                            </tbody>
                        </table>
                    </td>
                </tr>
            `;
        }
    });

    tbody.innerHTML = html;
}

function updateStats() {
    const symbols = Object.keys(portfolio);
    
    let totalValue = 0;
    let totalCost = 0;
    
    symbols.forEach(symbol => {
        const stock = portfolio[symbol];
        
        stock.lots.forEach(lot => {
            const purchasePriceInEur = stock.currency === 'USD' 
                ? lot.purchasePrice * usdToEurRate 
                : lot.purchasePrice;
            
            const currentPriceInEur = stock.currentPrice;
            
            totalValue += lot.shares * currentPriceInEur;
            totalCost += lot.shares * purchasePriceInEur;
        });
    });
    
    const unrealizedGain = totalValue - totalCost;
    const unrealizedPercent = totalCost > 0 ? (unrealizedGain / totalCost) * 100 : 0;

    document.getElementById('totalValue').textContent = formatEuro(totalValue);
    document.getElementById('totalCost').textContent = formatEuro(totalCost);
    
    const gainElement = document.getElementById('unrealizedGain');
    gainElement.textContent = `${unrealizedGain >= 0 ? '+' : ''}${formatEuro(unrealizedGain)}`;
    gainElement.className = `stat-value ${unrealizedGain >= 0 ? 'positive' : 'negative'}`;
    
    const percentElement = document.getElementById('unrealizedPercent');
    percentElement.textContent = `${unrealizedPercent >= 0 ? '+' : ''}${formatPercent(unrealizedPercent)}`;
    percentElement.className = `stat-change ${unrealizedPercent >= 0 ? 'positive' : 'negative'}`;

    // Cambio diario (placeholder - requerirÃ­a datos intradiarios)
    document.getElementById('dailyChange').textContent = '0,00';
    document.getElementById('dailyPercent').textContent = '0,00%';
}

// Establecer fecha por defecto a hoy
document.getElementById('dateInput').valueAsDate = new Date();

// Renderizado inicial
renderHoldings();
updateStats();
