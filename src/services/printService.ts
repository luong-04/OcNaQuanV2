import { Buffer } from 'buffer';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import TcpSocket from 'react-native-tcp-socket';
import { MenuItemWithCategory } from '../api/menuApi';
import { useSettingsStore } from '../stores/settingsStore';

export interface Calculations { subtotal: number; discountAmount: number; vatAmount: number; finalTotal: number; }

let isPrinting = false;
// Khổ giấy 46 ký tự (Chuẩn đẹp cho Xprinter K80)
const PRINTER_WIDTH = 46; 

const removeAccents = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D") : "";
const f = (num: number) => num.toLocaleString('vi-VN');

// Hàm căn chỉnh: Trái ------- Phải (Giữ nguyên vì bạn khen đẹp)
const formatRow = (left: string, right: string, width = PRINTER_WIDTH) => {
    const leftStr = removeAccents(left); 
    const rightStr = removeAccents(right);
    const spaceLen = width - leftStr.length - rightStr.length;
    if (spaceLen < 1) return leftStr + "\n" + " ".repeat(width - rightStr.length) + rightStr + "\n";
    return leftStr + " ".repeat(spaceLen) + rightStr + "\n";
}
const drawLine = (char = '-') => char.repeat(PRINTER_WIDTH) + "\n";

// Bộ lệnh ESC/POS chuẩn
const ESC = '\x1B'; const GS = '\x1D';
const CMD = {
  INIT: ESC + '@', 
  CENTER: ESC + 'a' + '\x01', 
  LEFT: ESC + 'a' + '\x00',
  BOLD_ON: ESC + 'E' + '\x01', 
  BOLD_OFF: ESC + 'E' + '\x00', 
  CUT: GS + 'V' + '\x42' + '\x00', 
  TEXT_DOUBLE_HEIGHT: GS + '!' + '\x10', 
  TEXT_BIG: GS + '!' + '\x11', // Chữ to gấp đôi (Dùng cho Tổng tiền)
  TEXT_NORMAL: GS + '!' + '\x00', 
};

// Hàm gửi lệnh xuống máy in (Giữ nguyên logic chống treo)
const sendToPrinter = (ip: string, port: number, data: Buffer): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!ip) { reject(new Error('Chưa cài đặt IP')); return; }
    try {
        const client = TcpSocket.createConnection({ port, host: ip }, () => {});
        const safetyTimeout = setTimeout(() => { 
            client.destroy(); 
            reject(new Error(`Timeout: ${ip}`)); 
        }, 5000);

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

// 1. IN BẾP (Giữ nguyên)
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

// 2. IN HỦY MÓN (Giữ nguyên)
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

// 3. IN HÓA ĐƠN (QUAN TRỌNG NHẤT)
export const printPaymentBill = async (
  tableName: string, orderItems: Map<number, number>, menu: MenuItemWithCategory[], calculations: Calculations, onPaid?: () => void
) => {
  if (isPrinting) return; isPrinting = true;
  const { paymentPrinterId, printer1, printer2, shopName, address, phone, thankYouMessage, vatPercent } = useSettingsStore.getState();
  const targetIp = paymentPrinterId === 'printer2' ? printer2 : printer1;

  if (!paymentPrinterId || !targetIp) { Alert.alert("Lỗi", "Chưa cài IP máy in hóa đơn.", [{ text: "OK", onPress: () => onPaid?.() }]); isPrinting = false; return; }

  try {
    const date = new Date(); const billId = `HD${date.getHours()}${date.getMinutes()}`; 
    
    // --- PHẦN ĐẦU (HEADER) ---
    // Tên quán in to đậm
    let txt = CMD.INIT + CMD.CENTER + CMD.BOLD_ON + CMD.TEXT_DOUBLE_HEIGHT + removeAccents(shopName).toUpperCase() + "\n" + CMD.TEXT_NORMAL + CMD.BOLD_OFF;
    txt += removeAccents(address) + "\n" + `Hotline: ${phone}\n` + drawLine('=');
    txt += "PHIEU THANH TOAN\n";
    txt += formatRow(`So: ${billId}`, `${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString('en-GB')}`);
    txt += formatRow(`Ban: ${removeAccents(tableName)}`, `Thu ngan: Admin`);
    txt += drawLine('-');
    
    // --- DANH SÁCH MÓN ---
    txt += CMD.BOLD_ON + formatRow("TEN MON", "THANH TIEN") + CMD.BOLD_OFF + drawLine('-');
    txt += CMD.LEFT; 
    orderItems.forEach((qty, id) => {
      const item = menu.find(m => m.id === id);
      if (item) {
        // Tên món in đậm cho dễ nhìn
        txt += CMD.BOLD_ON + removeAccents(item.name) + CMD.BOLD_OFF + "\n";
        // Số lượng và giá
        txt += formatRow(`${qty} x ${f(item.price)}`, f(item.price * qty));
      }
    });
    
    // --- TÍNH TIỀN ---
    txt += drawLine('-');
    txt += formatRow("Tam tinh:", f(calculations.subtotal));
    if (calculations.vatAmount > 0) txt += formatRow(`Thue VAT (${vatPercent}%):`, f(calculations.vatAmount));
    if (calculations.discountAmount > 0) txt += CMD.BOLD_ON + formatRow("GIAM:", `-${f(calculations.discountAmount)}`) + CMD.BOLD_OFF;
    
    // --- TỔNG CỘNG (IN TO & ĐẬM) ---
    txt += drawLine('=');
    // Bật chế độ chữ to gấp đôi (TEXT_BIG)
    txt += CMD.CENTER + CMD.BOLD_ON + CMD.TEXT_BIG + "TONG CONG:\n" + f(calculations.finalTotal) + " VND" + CMD.TEXT_NORMAL + CMD.BOLD_OFF;
    txt += "\n" + drawLine('='); // Kẻ thêm đường dưới cho đẹp

    // --- PHẦN CUỐI (FOOTER) - KHÔNG CÒN QR ---
    const footerTxt = "\n" + CMD.CENTER + removeAccents(thankYouMessage) + "\n" + "Powered by OcNaQuan App\n\n\n\n\n" + CMD.CUT;
    
    const bufferText = Buffer.from(txt, 'utf-8');
    const bufferFooter = Buffer.from(footerTxt, 'utf-8');

    await sendToPrinter(targetIp, 9100, Buffer.concat([bufferText, bufferFooter]));
    onPaid?.();
  } catch (e: any) { Alert.alert("Lỗi in ấn", `Không kết nối được ${targetIp}.`, [{ text: "OK", onPress: () => onPaid?.() }]); } 
  finally { setTimeout(() => isPrinting = false, 2000); }
};

// 4. CHIA SẺ PDF (VẪN CÓ QR ĐẸP ĐỂ GỬI ZALO)
export const sharePaymentBill = async (tableName: string, orderItems: Map<number, number>, menu: MenuItemWithCategory[], calculations: Calculations) => {
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