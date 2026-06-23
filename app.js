import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

document.addEventListener('DOMContentLoaded', () => {
  let prices = {};
  let txSnapshotData = [];

  // Recalculates all balances based on transactions and current prices
  function calculateGlobalMetrics() {
    let usdInvested = 0, zwgInvested = 0;
    let usdDividends = 0, zwgDividends = 0;
    let usdWallet = 0, zwgWallet = 0;
    let holdings = {};

    txSnapshotData.forEach((tx) => {
      const net = Number(tx.netAmount) || 0;
      const qty = Number(tx.quantity) || 0;
      const ticker = tx.ticker;
      const ex = tx.exchange;
      const cur = tx.currency;

      if (!holdings[ticker]) {
        holdings[ticker] = { exchange: ex, shares: 0, totalCost: 0, currency: ex === 'VFEX' ? 'USD' : 'ZWG' };
      }

      if (tx.type === 'BUY') {
        if (ex === 'VFEX') usdInvested += net; else zwgInvested += net;
        holdings[ticker].shares += qty;
        holdings[ticker].totalCost += net;
      } else if (tx.type === 'SELL') {
        if (ex === 'VFEX') usdInvested -= net; else zwgInvested -= net;
        holdings[ticker].shares -= qty;
        holdings[ticker].totalCost -= net;
      } else if (tx.type === 'DIVIDEND') {
        if (cur === 'USD') usdDividends += net; else zwgDividends += net;
      } else if (tx.type === 'WALLET_CREDIT') {
        if (cur === 'USD') usdWallet += net; else zwgWallet += net;
      } else if (tx.type === 'WALLET_DEBIT') {
        if (cur === 'USD') usdWallet -= net; else zwgWallet -= net;
      }
    });

    // Compute Current Market Values & Unrealized ROI metrics
    let cmvUsd = 0, cmvZwg = 0;
    for (const [ticker, data] of Object.entries(holdings)) {
      const livePrice = prices[ticker] || 0;
      if (data.currency === 'USD') {
        cmvUsd += data.shares * livePrice;
      } else {
        cmvZwg += data.shares * livePrice;
      }
    }

    const roiUsd = usdInvested > 0 ? ((cmvUsd - usdInvested) / usdInvested) * 100 : 0;
    const roiZwg = zwgInvested > 0 ? ((cmvZwg - zwgInvested) / zwgInvested) * 100 : 0;

    // Direct UI updates
    document.getElementById('total-invested-usd').innerText = `USD $${usdInvested.toFixed(2)}`;
    document.getElementById('total-invested-zwg').innerText = `ZWG ${zwgInvested.toFixed(2)}`;
    document.getElementById('total-dividends-usd').innerText = `USD $${usdDividends.toFixed(2)}`;
    document.getElementById('total-dividends-zwg').innerText = `ZWG ${zwgDividends.toFixed(2)}`;
    
    document.getElementById('cmv-usd').innerHTML = `USD $${cmvUsd.toFixed(2)} <span id="roi-usd" class="roi-badge ${roiUsd >= 0 ? 'up':'down'}">${roiUsd.toFixed(1)}%</span>`;
    document.getElementById('cmv-zwg').innerHTML = `ZWG ${cmvZwg.toFixed(2)} <span id="roi-zwg" class="roi-badge ${roiZwg >= 0 ? 'up':'down'}">${roiZwg.toFixed(1)}%</span>`;
    
    document.getElementById('wallet-usd').innerText = `USD $${usdWallet.toFixed(2)}`;
    document.getElementById('wallet-zwg').innerText = `ZWG ${zwgWallet.toFixed(2)}`;

    const tableTarget = document.getElementById('assets-target');
    tableTarget.innerHTML = '';
    
    for (const [ticker, data] of Object.entries(holdings)) {
      if (data.shares > 0) {
        const acb = data.totalCost / data.shares;
        const styleColor = data.currency === 'USD' ? '#00f2fe' : '#34d399';
        tableTarget.innerHTML += `
          <tr>
            <td style="color:${styleColor}; font-weight:bold;">${ticker}</td>
            <td>${data.exchange}</td>
            <td style="font-size: 0.85rem; font-weight: 600;">${data.currency}</td>
            <td>${data.shares.toLocaleString()}</td>
            <td>${data.currency === 'USD' ? '$':''}${acb.toFixed(4)}</td>
          </tr>
        `;
      }
    }
  }

  // Intercept changes to asset prices in real time
  onSnapshot(collection(db, 'users', TARGET_USER, 'assets'), (assetSnap) => {
    prices = {};
    assetSnap.forEach((doc) => {
      prices[doc.id] = Number(doc.data().currentPrice) || 0;
    });
    calculateGlobalMetrics();
  });

  // Intercept ledger updates to transactions in real time
  onSnapshot(collection(db, 'users', TARGET_USER, 'transactions'), (snapshot) => {
    txSnapshotData = [];
    snapshot.forEach((doc) => {
      txSnapshotData.push(doc.data());
    });
    calculateGlobalMetrics();
  });
});