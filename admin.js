import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, writeBatch, onSnapshot, deleteDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD5YKwEl76G4UmDIRBFc4QFNNkObn1OERA",
  authDomain: "portfolio-2e305.firebaseapp.com",
  projectId: "portfolio-2e305",
  storageBucket: "portfolio-2e305.firebasestorage.app",
  messagingSenderId: "197327801363",
  appId: "1:197327801363:web:7921cef2f21b16473cc3e6",
  measurementId: "G-5JGT9E1NJN"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const TARGET_USER = "system_user_profile";
const FX_RATE = 27.00; // Static USD to ZWG tracking metric variable configuration

const form = document.getElementById('tx-form');
const txTypeSelect = document.getElementById('tx-type');
const txExchangeSelect = document.getElementById('tx-exchange');
const divCurrencyContainer = document.getElementById('div-currency-container');
const holdPeriodContainer = document.getElementById('hold-period-container');
const priceLabel = document.getElementById('price-label');
const qtyLabel = document.getElementById('qty-label');

function updateUIFields() {
  const type = txTypeSelect.value;
  const exchange = txExchangeSelect.value;
  const currency = exchange === 'VFEX' ? 'USD ($)' : 'ZWG';

  holdPeriodContainer.style.display = type === 'SELL' ? 'block' : 'none';
  divCurrencyContainer.style.display = (type === 'DIVIDEND' || type === 'DRIP') ? 'block' : 'none';
  
  if (type === 'DIVIDEND') {
    qtyLabel.innerText = "Current Total Share Count Held";
    priceLabel.innerText = "Gross Dividend Declared Per Share (USD/ZWG)";
  } else if (type === 'DRIP') {
    qtyLabel.innerText = "Current Total Share Count Held";
    priceLabel.innerText = "Gross Dividend Rate Declared Per Share (USD)";
  } else {
    qtyLabel.innerText = "Quantity (Shares)";
    priceLabel.innerText = `Price Per Share (${currency})`;
  }
}

txTypeSelect.addEventListener('change', updateUIFields);
txExchangeSelect.addEventListener('change', updateUIFields);

function calculateNetFees(exchange, type, qty, price, holdingMonths, divCurrency) {
  const gross = qty * price;
  let fees = 0, net = gross;

  if (type === 'BUY') {
    fees = gross * (exchange === 'VFEX' ? 0.01277 : 0.01719);
    net = gross + fees;
  } else if (type === 'SELL') {
    fees = gross * (exchange === 'VFEX' ? 0.01027 : (holdingMonths > 6 ? 0.02469 : 0.02969));
    net = gross - fees;
  } else if (type === 'DIVIDEND' || type === 'DRIP') {
    // 10% withholding tax on local ZSE assets, 5% on offshore dollarized channels
    fees = gross * (exchange === 'VFEX' ? 0.05 : 0.10);
    net = gross - fees;
  }
  return { fees, net };
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const ticker = document.getElementById('tx-ticker').value.toUpperCase();
  const exchange = document.getElementById('tx-exchange').value;
  const type = document.getElementById('tx-type').value;
  const qty = parseFloat(document.getElementById('tx-qty').value) || 0;
  const price = parseFloat(document.getElementById('tx-price').value) || 0;
  const holdingMonths = parseInt(document.getElementById('tx-holding').value) || 0;
  const divCurrency = document.getElementById('tx-div-currency').value;

  const baseCurrency = exchange === 'VFEX' ? 'USD' : 'ZWG';

  try {
    const batch = writeBatch(db);
    const txCollectionRef = collection(db, 'users', TARGET_USER, 'transactions');
    const assetRef = doc(db, 'users', TARGET_USER, 'assets', ticker);

    if (type === 'DRIP') {
      // 1. Calculate the raw USD dividend from holding the asset
      const dividendMath = calculateNetFees(exchange, 'DIVIDEND', qty, price, 0, divCurrency);
      
      const divTxRef = doc(txCollectionRef);
      batch.set(divTxRef, {
        ticker, exchange, type: 'DIVIDEND', quantity: qty, pricePerShare: price,
        totalFees: dividendMath.fees, netAmount: dividendMath.net, currency: divCurrency, date: new Date()
      });

      // 2. Perform automated asset routing and currency calculations to handle reinvestments
      let executableCapitalZWG = dividendMath.net * FX_RATE; 
      const marketPriceQuery = document.createElement('div'); 
      // Manual lookups will fetch data dynamically; assume local price tracking is active
      alert("Notice: DRIP converts USD " + dividendMath.net.toFixed(2) + " to ZWG " + executableCapitalZWG.toFixed(2) + " using the 27.00 exchange rate.");

      // Prompt to calculate optimal share purchases vs wallet allocation changes
      const currentShareAssetPriceZWG = prompt("Enter current market price for 1 share of " + ticker + " in ZWG:");
      if(!currentShareAssetPriceZWG) { alert("Execution halted."); return; }
      
      const pricePerUnit = parseFloat(currentShareAssetPriceZWG);
      const feeMultiplier = 1 + 0.01719; // 1.719% purchase fee
      const totalCostPerFullShareZWG = pricePerUnit * feeMultiplier;
      
      const purchaseableFullSharesCount = Math.floor(executableCapitalZWG / totalCostPerFullShareZWG);
      
      if (purchaseableFullSharesCount > 0) {
        const netCostZWG = purchaseableFullSharesCount * pricePerUnit;
        const totalFeesZWG = netCostZWG * 0.01719;
        const totalDebitedCapitalZWG = netCostZWG + totalFeesZWG;
        const residualChangeZWG = executableCapitalZWG - totalDebitedCapitalZWG;

        const buyTxRef = doc(txCollectionRef);
        batch.set(buyTxRef, {
          ticker, exchange, type: 'BUY', quantity: purchaseableFullSharesCount, pricePerShare: pricePerUnit,
          totalFees: totalFeesZWG, netAmount: totalDebitedCapitalZWG, currency: 'ZWG', date: new Date()
        });

        if(residualChangeZWG > 0) {
          const changeTxRef = doc(txCollectionRef);
          batch.set(changeTxRef, {
            ticker, exchange, type: 'WALLET_CREDIT', quantity: 0, pricePerShare: 0,
            totalFees: 0, netAmount: residualChangeZWG, currency: 'ZWG', date: new Date()
          });
        }
      } else {
        // Drop the total cash sum straight into the broker wallet if it can't buy a whole share
        const changeTxRef = doc(txCollectionRef);
        batch.set(changeTxRef, {
          ticker, exchange, type: 'WALLET_CREDIT', quantity: 0, pricePerShare: 0,
          totalFees: 0, netAmount: executableCapitalZWG, currency: 'ZWG', date: new Date()
        });
      }
      
      batch.set(assetRef, { ticker, exchange, currency: baseCurrency, lastUpdated: new Date() }, { merge: true });

    } else {
      // Handle normal BUY, SELL, or standard DIVIDEND flows
      const math = calculateNetFees(exchange, type, qty, price, holdingMonths, divCurrency);
      const activeTxCurrency = type === 'DIVIDEND' ? divCurrency : baseCurrency;
      const txRef = doc(txCollectionRef);

      batch.set(txRef, {
        ticker, exchange, type, quantity: qty, pricePerShare: price,
        totalFees: math.fees, netAmount: math.net, currency: activeTxCurrency, date: new Date()
      });

      if (type !== 'DIVIDEND') {
        batch.set(assetRef, { ticker, exchange, currency: baseCurrency, lastUpdated: new Date() }, { merge: true });
      }
    }

    await batch.commit();
    alert(`Success: Transaction data package logged.`);
    form.reset();
    updateUIFields();
  } catch (error) {
    alert("Database Mutation Fault: " + error.message);
  }
});

// Manual Market Valuation pricing configuration form handler
document.getElementById('price-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ticker = document.getElementById('price-ticker').value.toUpperCase().trim();
  const currentPrice = parseFloat(document.getElementById('price-current').value) || 0;

  try {
    await setDoc(doc(db, 'users', TARGET_USER, 'assets', ticker), {
      currentPrice: currentPrice,
      priceLastUpdated: new Date()
    }, { merge: true });
    alert(`Success: Price updated for ${ticker}`);
    document.getElementById('price-form').reset();
  } catch (err) {
    alert("Error saving valuation: " + err.message);
  }
});

onSnapshot(collection(db, 'users', TARGET_USER, 'transactions'), (snapshot) => {
  const target = document.getElementById('admin-tx-target');
  target.innerHTML = '';
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const symbol = data.currency === 'USD' ? '$' : ' ';
    target.innerHTML += `
      <tr>
        <td>${data.ticker}</td>
        <td><span class="badge-${data.type.toLowerCase()}">${data.type}</span></td>
        <td>${data.exchange}</td>
        <td>${symbol}${Number(data.netAmount).toFixed(2)} <span class="curr-tag">${data.currency}</span></td>
        <td><button class="btn-delete-tx" data-id="${docSnap.id}">Delete</button></td>
      </tr>`;
  });

  document.querySelectorAll('.btn-delete-tx').forEach(button => {
    button.addEventListener('click', (e) => {
      const txId = e.target.getAttribute('data-id');
      window.removeTx(txId);
    });
  });
});

window.removeTx = async function(id) {
  if(confirm("Wipe this ledger row item transaction permanently?")) {
    await deleteDoc(doc(db, 'users', TARGET_USER, 'transactions', id));
  }
};

updateUIFields();