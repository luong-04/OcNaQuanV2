import { Buffer } from 'buffer';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import TcpSocket from 'react-native-tcp-socket';
import { MenuItemWithCategory } from '../api/menuApi';
import { useSettingsStore } from '../stores/settingsStore';

export interface Calculations { subtotal: number; discountAmount: number; vatAmount: number; finalTotal: number; }

let isPrinting = false;
const PRINTER_WIDTH = 46; 

const BANK_DISPLAY_NAME: Record<string, string> = {
    'MB': 'MB BANK', 'VCB': 'VIETCOMBANK', 'TCB': 'TECHCOMBANK', 'ACB': 'ACB BANK',
    'VPB': 'VPBANK', 'ICB': 'VIETINBANK', 'BIDV': 'BIDV', 'TPB': 'TPBANK',
    'STB': 'SACOMBANK', 'VIB': 'VIB', 'VBA': 'AGRIBANK', 'MSB': 'MSB', 'OCB': 'OCB',
};

const BANK_BIN_MAPPING: Record<string, string> = {
    'VCB': '970436', 'VIETCOMBANK': '970436', 'MB': '970422', 'MBBANK': '970422',
    'TCB': '970407', 'TECHCOMBANK': '970407', 'ACB': '970416', 'VPB': '970432', 'VPBANK': '970432',
    'ICB': '970415', 'VIETINBANK': '970415', 'BIDV': '970418', 'TPB': '970423', 'TPBANK': '970423',
    'STB': '970403', 'SACOMBANK': '970403', 'VIB': '970441', 'AGRIBANK': '970405',
};

const removeAccents = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D") : "";
const f = (num: number) => num.toLocaleString('vi-VN');

const formatRow = (left: string, right: string, width = PRINTER_WIDTH) => {
    const leftStr = removeAccents(left); const rightStr = removeAccents(right);
    const spaceLen = width - leftStr.length - rightStr.length;
    if (spaceLen < 1) return leftStr + "\n" + " ".repeat(width - rightStr.length) + rightStr + "\n";
    return leftStr + " ".repeat(spaceLen) + rightStr + "\n";
}
const drawLine = (char = '-') => char.repeat(PRINTER_WIDTH) + "\n";

const ESC = '\x1B'; const GS = '\x1D';
const CMD = {
  INIT: ESC + '@', CENTER: ESC + 'a' + '\x01', LEFT: ESC + 'a' + '\x00',
  BOLD_ON: ESC + 'E' + '\x01', BOLD_OFF: ESC + 'E' + '\x00', CUT: GS + 'V' + '\x42' + '\x00', 
  TEXT_DOUBLE_HEIGHT: GS + '!' + '\x10', TEXT_BIG: GS + '!' + '\x11', TEXT_NORMAL: GS + '!' + '\x00', 
};

// --- NATIVE QR COMMAND ---
const getNativeQRCommand = (content: string) => {
    const len = content.length + 3;
    const pL = len % 256;
    const pH = Math.floor(len / 256);

    return Buffer.concat([
        // Model 2
        Buffer.from([0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
        // Size 8 (To, Rõ)
        Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x08]), 
        // Level L (Dễ in nhất)
        Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x30]),
        // Data
        Buffer.from([0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30]),
        Buffer.from(content, 'utf-8'),
        // Print
        Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30])
    ]);
};

// ...
const crc16 = (data: string) => {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= data.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) { if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021; else crc = crc << 1; }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
};

const generateVietQR = (bankId: string, accountNo: string, amount: number, content: string) => {
    const cleanAccountNo = accountNo.replace(/[^a-zA-Z0-9]/g, ''); 
    const cleanBankId = bankId.trim().toUpperCase();
    const bin = BANK_BIN_MAPPING[cleanBankId];
    if (!bin) return null;
    const len = (str: string) => str.length.toString().padStart(2, '0');
    
    // Tạo QR VietQR
    let qr = "000201010212";
    const bankInfo = `00069704${bin}01${len(cleanAccountNo)}${cleanAccountNo}`;
    const merchantInfo = `0010A00000072701${len(bankInfo)}${bankInfo}0208QRIBFTTA`;
    qr += `38${len(merchantInfo)}${merchantInfo}`; 
    qr += "5303704";
    
    // [ĐÃ SỬA] Nếu amount > 0 mới thêm, nhưng ở hàm gọi ta sẽ truyền 0 vào -> Không bao giờ in tiền
    if (amount > 0) { qr += `54${len(amount.toString())}${amount}`; }
    
    qr += "5802VN";
    
    // [ĐÃ SỬA] Nếu có content mới thêm. Ta sẽ truyền rỗng -> Không bao giờ in nội dung
    let cleanContent = removeAccents(content).replace(/[^a-zA-Z0-9 ]/g, "").trim().substring(0, 18);
    if (cleanContent.length > 0) { const addData = `08${len(cleanContent)}${cleanContent}`; qr += `62${len(addData)}${addData}`; }
    
    qr += "6304"; 
    qr += crc16(qr);
    return qr;
};

const sendToPrinter = (ip: string, port: number, data: Buffer): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!ip) { reject(new Error('Chưa cài đặt IP')); return; }
    try {
        const client = TcpSocket.createConnection({ port, host: ip }, () => {});
        const safetyTimeout = setTimeout(() => { client.destroy(); reject(new Error(`Timeout: ${ip}`)); }, 5000);
        client.on('connect', () => {
          clearTimeout(safetyTimeout);
          setTimeout(() => {
            try {
                client.write(data);
                setTimeout(() => { client.destroy(); resolve(); }, 2000); 
            } catch (err) { client.destroy(); reject(new Error("Lỗi gửi dữ liệu")); }
          }, 100); 
        });
        client.on('error', (e) => { clearTimeout(safetyTimeout); client.destroy(); reject(new Error(e.message)); });
    } catch (e: any) { reject(new Error(e.message)); }
  });
};

export const printKitchenBill = async (tableName: string, orderItems: Map<number, number>, menu: MenuItemWithCategory[]) => {
    if (isPrinting) return; isPrinting = true;
    const settings = useSettingsStore.getState();
    const targetIp = settings.kitchenPrinterId === 'printer2' ? settings.printer2 : settings.printer1;
    try {
        if (!settings.kitchenPrinterId || !targetIp) { Alert.alert("Lỗi", "Chưa cấu hình máy in Bếp."); return; }
        let txt = CMD.INIT + CMD.CENTER + CMD.BOLD_ON + CMD.TEXT_DOUBLE_HEIGHT + "PHIEU CHE BIEN\n" + CMD.TEXT_NORMAL + CMD.BOLD_OFF;
        txt += `Ban: ${removeAccents(tableName)}\n` + `${new Date().toLocaleTimeString('vi-VN')}\n` + drawLine('=') + CMD.LEFT;
        orderItems.forEach((qty, id) => { 
            const i = menu.find(m => m.id === id); 
            if(i) txt += CMD.BOLD_ON + `${removeAccents(i.name)}\n` + CMD.BOLD_ON + CMD.TEXT_BIG + `SL: ${qty}` + CMD.TEXT_NORMAL + CMD.BOLD_OFF + "\n" + drawLine('-');
        });
        txt += "\n\n\n\n" + CMD.CUT;
        await sendToPrinter(targetIp, 9100, Buffer.from(txt));
    } catch(e: any) { Alert.alert("Lỗi In Bếp", e.message); } finally { setTimeout(() => isPrinting = false, 1000); }
};

export const printKitchenCancellation = async (tableName: string, cancelledItems: Map<number, number>, menu: MenuItemWithCategory[], reason: string) => {
     if (isPrinting) return; isPrinting = true;
    const settings = useSettingsStore.getState();
    const targetIp = settings.kitchenPrinterId === 'printer2' ? settings.printer2 : settings.printer1;
    try {
        if (!settings.kitchenPrinterId || !targetIp) return;
        let txt = CMD.INIT + CMD.CENTER + CMD.BOLD_ON + CMD.TEXT_DOUBLE_HEIGHT + "!!! HUY MON !!!\n" + CMD.TEXT_NORMAL + CMD.BOLD_OFF;
        txt += `Ban: ${removeAccents(tableName)}\n` + drawLine('=') + CMD.LEFT;
        cancelledItems.forEach((qty, id) => { 
            const i = menu.find(m => m.id === id); 
            if(i) txt += `${removeAccents(i.name)}\n` + CMD.BOLD_ON + CMD.TEXT_BIG + `HUY: -${qty}` + CMD.TEXT_NORMAL + CMD.BOLD_OFF + "\n" + `LY DO: ${removeAccents(reason)}\n` + drawLine('-');
        });
        txt += "\n\n\n\n" + CMD.CUT;
        await sendToPrinter(targetIp, 9100, Buffer.from(txt));
    } catch(e) {} finally { setTimeout(() => isPrinting = false, 1000); }
};

export const printPaymentBill = async (
  tableName: string, orderItems: Map<number, number>, menu: MenuItemWithCategory[], calculations: Calculations, onPaid?: () => void
) => {
  if (isPrinting) return; isPrinting = true;
  const { paymentPrinterId, printer1, printer2, shopName, address, phone, thankYouMessage, bankId, accountNo, vatPercent } = useSettingsStore.getState();
  const targetIp = paymentPrinterId === 'printer2' ? printer2 : printer1;

  if (!paymentPrinterId || !targetIp) { Alert.alert("Lỗi", "Chưa cài IP máy in hóa đơn.", [{ text: "OK", onPress: () => onPaid?.() }]); isPrinting = false; return; }

  try {
    const date = new Date(); const billId = `HD${date.getHours()}${date.getMinutes()}`; 
    let txt = CMD.INIT + CMD.CENTER + CMD.BOLD_ON + CMD.TEXT_DOUBLE_HEIGHT + removeAccents(shopName).toUpperCase() + "\n" + CMD.TEXT_NORMAL + CMD.BOLD_OFF;
    txt += removeAccents(address) + "\n" + `Hotline: ${phone}\n` + drawLine('=');
    txt += "PHIEU THANH TOAN\n";
    txt += formatRow(`So: ${billId}`, `${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString('en-GB')}`);
    txt += formatRow(`Ban: ${removeAccents(tableName)}`, `Thu ngan: Admin`);
    txt += drawLine('-');
    txt += CMD.BOLD_ON + formatRow("TEN MON", "THANH TIEN") + CMD.BOLD_OFF + drawLine('-');
    txt += CMD.LEFT; 
    orderItems.forEach((qty, id) => {
      const item = menu.find(m => m.id === id);
      if (item) {
        txt += CMD.BOLD_ON + removeAccents(item.name) + CMD.BOLD_OFF + "\n";
        txt += formatRow(`${qty} x ${f(item.price)}`, f(item.price * qty));
      }
    });
    txt += drawLine('-');
    txt += formatRow("Tam tinh:", f(calculations.subtotal));
    if (calculations.vatAmount > 0) txt += formatRow(`Thue VAT (${vatPercent}%):`, f(calculations.vatAmount));
    if (calculations.discountAmount > 0) txt += CMD.BOLD_ON + formatRow("GIAM:", `-${f(calculations.discountAmount)}`) + CMD.BOLD_OFF;
    txt += drawLine('=');
    txt += CMD.BOLD_ON + CMD.TEXT_NORMAL + formatRow("TONG CONG:", `${f(calculations.finalTotal)} VND`) + CMD.BOLD_OFF;
    txt += "\n"; 

    const bufferText = Buffer.from(txt, 'utf-8');
    let bufferQR = Buffer.alloc(0);
    let bufferQRInfo = Buffer.alloc(0);

    if (bankId && accountNo) {
        // [QUAN TRỌNG] Truyền 0 (tiền) và '' (nội dung) để tạo QR Tĩnh hoàn toàn
        const qrContent = generateVietQR(bankId, accountNo, 0, '');
        
        if (qrContent) {
            try {
                const bankDisplay = BANK_DISPLAY_NAME[bankId] || bankId;
                const qrHeaderText = `\nQUET MA ${bankDisplay}:\n`; 
                const qrHeader = Buffer.from(CMD.CENTER + CMD.BOLD_ON + CMD.TEXT_NORMAL + qrHeaderText + CMD.BOLD_OFF, 'utf-8');
                
                // [NATIVE QR] Size 8
                const qrNative = getNativeQRCommand(qrContent); 
                
                // Chỉ hiển thị STK, không hiển thị lời nhắn chuyển khoản thừa thãi
                const qrInfoText = `\nSTK: ${accountNo}\n\n`;
                const qrFooterInfo = Buffer.from(CMD.CENTER + CMD.BOLD_ON + qrInfoText + CMD.BOLD_OFF, 'utf-8');

                bufferQR = Buffer.concat([qrHeader, qrNative]);
                bufferQRInfo = qrFooterInfo;
            } catch (e) {}
        }
    }

    const footerTxt = CMD.CENTER + "\n" + removeAccents(thankYouMessage) + "\n" + "Powered by OcNaQuan App\n\n\n\n\n" + CMD.CUT;
    const bufferFooter = Buffer.from(footerTxt, 'utf-8');

    await sendToPrinter(targetIp, 9100, Buffer.concat([bufferText, bufferQR, bufferQRInfo, bufferFooter]));
    onPaid?.();
  } catch (e: any) { Alert.alert("Lỗi in ấn", `Không kết nối được ${targetIp}.`, [{ text: "OK", onPress: () => onPaid?.() }]); } 
  finally { setTimeout(() => isPrinting = false, 2000); }
};

export const sharePaymentBill = async (tableName: string, orderItems: Map<number, number>, menu: MenuItemWithCategory[], calculations: Calculations) => {
    // ... (Giữ nguyên phần PDF đẹp của bạn)
    const { shopName, address, phone, thankYouMessage, bankId, accountNo, vatPercent } = useSettingsStore.getState();
    const itemsArr = Array.from(orderItems.entries()).map(([id, qty]) => { const item = menu.find(m => m.id === id); return item ? { ...item, quantity: qty } : null; }).filter((item): item is MenuItemWithCategory & { quantity: number } => item !== null);
    
    let qrSection = '';
    if (bankId && accountNo) {
        const addInfo = `TT ${tableName}`.replace(/ /g, '%20');
        const qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact.png?amount=${calculations.finalTotal}&addInfo=${addInfo}`;
        qrSection = `<div class="qr-container"><p>QUÉT MÃ THANH TOÁN</p><img src="${qrUrl}" /><p>${bankId} - ${accountNo}</p></div>`;
    }
    const date = new Date();
    const billId = `HD${date.getHours()}${date.getMinutes()}`;
    const html = `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /><style>body { font-family: 'Courier New', Courier, monospace; background: #fff; padding: 20px; color: #000; } .bill-container { width: 100%; max-width: 400px; margin: 0 auto; border: 1px solid #ddd; padding: 15px; } .center { text-align: center; } .right { text-align: right; } .bold { font-weight: bold; } .uppercase { text-transform: uppercase; } .divider { border-bottom: 1px dashed #000; margin: 10px 0; } .double-divider { border-bottom: 3px double #000; margin: 10px 0; } .info-row { display: flex; justify-content: space-between; font-size: 13px; } .item-row { margin-bottom: 5px; font-size: 14px; } .item-calc { display: flex; justify-content: space-between; padding-left: 10px; } .total-row { display: flex; justify-content: space-between; font-size: 16px; margin-top: 5px; } .big-total { font-size: 18px; font-weight: bold; } .qr-container { text-align: center; margin-top: 15px; border: 1px dashed #aaa; padding: 10px; border-radius: 8px; } .qr-container img { width: 150px; height: 150px; }</style></head><body><div class="bill-container"><div class="center"><h2 class="uppercase">${shopName}</h2><p>${address}</p><p>Hotline: ${phone}</p></div><div class="double-divider"></div><div class="center bold">PHIEU THANH TOAN</div><div class="info-row"><span>So: ${billId}</span><span>${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString('en-GB')}</span></div><div class="info-row"><span>Ban: ${tableName}</span><span>Thu ngan: Admin</span></div><div class="divider"></div><div class="info-row bold"><span>TEN MON</span><span>THANH TIEN</span></div><div class="divider"></div>${itemsArr.map(i => `<div class="item-row"><span class="item-name bold">${i.name}</span><div class="item-calc"><span>${i.quantity} x ${f(i.price)}</span><span>${f(i.price * i.quantity)}</span></div></div>`).join('')}<div class="divider"></div><div class="total-row"><span>Tam tinh:</span><span>${f(calculations.subtotal)}</span></div>${calculations.vatAmount > 0 ? `<div class="total-row"><span>Thue VAT (${vatPercent}%):</span><span>${f(calculations.vatAmount)}</span></div>` : ''}${calculations.discountAmount > 0 ? `<div class="total-row bold"><span>GIAM:</span><span>-${f(calculations.discountAmount)}</span></div>` : ''}<div class="double-divider"></div><div class="total-row big-total"><span>TONG CONG:</span><span>${f(calculations.finalTotal)}</span></div>${qrSection}<div class="center" style="margin-top: 20px;"><p class="bold">${thankYouMessage}</p></div></div></body></html>`;
    try { const { uri } = await Print.printToFileAsync({ html, width: 576 }); await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' }); } catch (error) {}
};