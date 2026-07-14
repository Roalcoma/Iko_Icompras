import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useBrandingStore } from '../stores/useBrandingStore';

export interface FacturaPDFHeader {
    Pedido: string; FacturaNo: string; Fecha: string; FechaVencimiento: string;
    RazonSocial: string; DireccionEnvio: string; Vendedor: string;
    TasaStr: string; CondicionPago: string; RIF: string; CodCliente: string;
    Unidades: number; Bultos: string | number;
    SICM: string; Ruta: string; Psicotropico?: string;
    SubTotalRef: string; BaseExentaRef: string; BaseImponibleRef: string;
    IVA_Ref: string; DescRef: string; NetoRef: string;
    SubTotalBs: string; BaseExentaBs: string; BaseImponibleBs: string;
    IVA_Bs: string; DescBs: string; NetoBs: string;
    TipoDoc: string; FacturaAfectada?: string;
}

export interface FacturaPDFItem {
    Desc: string; Cant: number | string;
    Lote: string; Vence: string; PVP: string;
    D1: string; D2: string; D3: string; D4: string;
    PrecU: string; PrecDolar: string;
    IVA_USD: string; IVA_V: string; Neto: string;
}

export interface FacturaPDFData {
    numserie: string; numfactura: number; nocontrol?: string | number | null;
    header: FacturaPDFHeader;
    items: FacturaPDFItem[];
}

export async function generarFacturaPDF(data: FacturaPDFData): Promise<Blob> {
    const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
    const W = doc.internal.pageSize.getWidth();   // 215.9 mm
    const H = doc.internal.pageSize.getHeight();  // 279.4 mm
    const M = 10; // left margin mm
    const logoUrl = useBrandingStore().logo;

    // ── Logo ────────────────────────────────────────────────────────────────
    try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = logoUrl;
        });
        doc.addImage(img, 'PNG', M, 4, 30, 14);
    } catch { /* skip */ }

    // ── Empresa ─────────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('DROGUERÍA INTERCONTINENTAL, C.A.', M + 33, 10);
    doc.setFontSize(7);
    doc.text('RIF: J-50159019-2', W - M, 10, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text('AV. CRUZ PERAZA LOCAL GALPÓN NRO 02 SECTOR LA CARBONERA, MATURÍN - MONAGAS', M + 33, 15);

    // NOCONTROL
    if (data.nocontrol) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(`N° Control: ${data.nocontrol}`, W - M, 15, { align: 'right' });
    }

    doc.line(M, 20, W - M, 20);

    // ── Tipo documento + número ─────────────────────────────────────────────
    const xRight = W - M - 60; // start of right column
    const yDatos = 26;
    const lh = 5.5; // line height mm

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`${data.header.TipoDoc} N°: ${data.header.FacturaNo}`, W - M, yDatos, { align: 'right' });

    doc.setFontSize(7);
    doc.text(`Fecha Emisión: ${data.header.Fecha}`, W - M, yDatos + lh, { align: 'right' });

    if (data.header.FacturaAfectada) {
        doc.text(`Fac. Afectada: ${data.header.FacturaAfectada}`, W - M, yDatos + lh * 2, { align: 'right' });
    } else {
        doc.text(`Fecha Vcto: ${data.header.FechaVencimiento || data.header.Fecha}`, W - M, yDatos + lh * 2, { align: 'right' });
    }
    doc.text(`Cond. Pago: ${data.header.CondicionPago}`, W - M, yDatos + lh * 3, { align: 'right' });
    doc.text(`Cód. Cliente: ${data.header.CodCliente}`, W - M, yDatos + lh * 4, { align: 'right' });

    // ── Cliente (izquierda) ─────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    const maxClienteW = xRight - M - 6;

    let clienteStr = `CLIENTE: ${data.header.RazonSocial}`;
    while (doc.getTextWidth(clienteStr) > maxClienteW && clienteStr.length > 12)
        clienteStr = clienteStr.slice(0, -1);
    doc.text(clienteStr, M, yDatos);

    doc.text(`RIF: ${data.header.RIF}`, M, yDatos + lh);

    doc.setFontSize(6.5);
    const dirLabel = 'Dirección Fiscal: ';
    const dirLabelW = doc.getTextWidth(dirLabel);
    doc.text(dirLabel, M, yDatos + lh * 2);
    doc.setFont('helvetica', 'normal');
    let dirStr = data.header.DireccionEnvio || '';
    const dirMaxW = maxClienteW - dirLabelW;
    if (doc.getTextWidth(dirStr) > dirMaxW) {
        while (dirStr.length && doc.getTextWidth(dirStr) > dirMaxW)
            dirStr = dirStr.slice(0, -1);
    }
    doc.text(dirStr, M + dirLabelW, yDatos + lh * 2);

    // Vendedor / Pedido / SICM / Ruta
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    const infoLine = `Vendedor: ${data.header.Vendedor}   PEDIDO: ${data.header.Pedido}   SICM: ${data.header.SICM}   Ruta: ${data.header.Ruta}`;
    let infoStr = infoLine;
    while (doc.getTextWidth(infoStr) > W - M * 2 && infoStr.length > 10)
        infoStr = infoStr.slice(0, -1);
    doc.text(infoStr, M, yDatos + lh * 4);

    doc.line(M, yDatos + lh * 4 + 3, W - M, yDatos + lh * 4 + 3);

    // ── Tabla de artículos ───────────────────────────────────────────────────
    const tableStart = yDatos + lh * 4 + 6;

    const cols = [
        { header: 'Descripción', dataKey: 'Desc' },
        { header: 'Cant', dataKey: 'Cant' },
        { header: 'Lote', dataKey: 'Lote' },
        { header: 'Vence', dataKey: 'Vence' },
        { header: 'PVP', dataKey: 'PVP' },
        { header: 'D/1', dataKey: 'D1' },
        { header: 'D/2', dataKey: 'D2' },
        { header: 'D/3', dataKey: 'D3' },
        { header: 'D/4', dataKey: 'D4' },
        { header: 'P.Unit', dataKey: 'PrecU' },
        { header: 'P.$', dataKey: 'PrecDolar' },
        { header: 'IVA $', dataKey: 'IVA_USD' },
        { header: 'IVA Bs', dataKey: 'IVA_V' },
        { header: 'NETO', dataKey: 'Neto' },
    ];

    autoTable(doc, {
        startY: tableStart,
        columns: cols,
        body: data.items,
        theme: 'plain',
        styles: { fontSize: 5.5, cellPadding: 0.8, overflow: 'ellipsize' },
        headStyles: { fontStyle: 'bold', lineWidth: 0.1, lineColor: [0, 0, 0] },
        bodyStyles: { lineWidth: 0.05, lineColor: [180, 180, 180] },
        margin: { left: M, right: M },
        columnStyles: {
            0:  { cellWidth: 42, halign: 'left'   },
            1:  { cellWidth: 8,  halign: 'center' },
            2:  { cellWidth: 14, halign: 'left'   },
            3:  { cellWidth: 14, halign: 'left'   },
            4:  { cellWidth: 13, halign: 'right'  },
            5:  { cellWidth: 9,  halign: 'right'  },
            6:  { cellWidth: 9,  halign: 'right'  },
            7:  { cellWidth: 9,  halign: 'right'  },
            8:  { cellWidth: 9,  halign: 'right'  },
            9:  { cellWidth: 15, halign: 'right'  },
            10: { cellWidth: 14, halign: 'right'  },
            11: { cellWidth: 13, halign: 'right'  },
            12: { cellWidth: 13, halign: 'right'  },
            13: { cellWidth: 14, halign: 'right'  },
        },
    });

    const afterTable = (doc as any).lastAutoTable.finalY + 3;

    // SACS (psicotrópico)
    const psico = (data.header.Psicotropico || '').trim();
    if (psico && !['', 'none', 'null'].includes(psico.toLowerCase())) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.text(`#SACS: ${psico}`, W / 2, afterTable + 2, { align: 'center' });
    }

    // ── Pie de totales ───────────────────────────────────────────────────────
    // Posición fija: ~51mm desde el fondo (equivale a 2in en ReportLab)
    const yPie = H - 51;

    // Caja izquierda: INTERCONTINENTAL + unidades + tasa
    doc.rect(M, yPie, 80, 11);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('INTERCONTINENTAL', M + 2, yPie + 4);
    doc.setFontSize(6);
    doc.text(`SICM ${data.header.SICM}`, M + 2, yPie + 8);
    doc.setFontSize(8);
    doc.text(`Unidades: ${data.header.Unidades}`, M + 28, yPie + 6.5);
    doc.text(`Tasa: ${data.header.TasaStr}`, M + 55, yPie + 6.5);

    // Caja derecha: tabla de totales (Ref / Bs)
    const xTot = M + 88;
    const totW  = W - M - xTot;
    doc.rect(xTot, yPie - 14, totW, 25);
    doc.line(xTot + totW / 2, yPie - 14, xTot + totW / 2, yPie + 11); // vertical divider

    const labelsRef = ['Sub-Total Ref', 'Base Exenta Ref', 'Base Imponible Ref', 'IVA (16%) Ref', 'Total a Pagar Ref'];
    const valsRef   = [data.header.SubTotalRef, data.header.BaseExentaRef, data.header.BaseImponibleRef, data.header.IVA_Ref, data.header.NetoRef];
    const labelsBs  = ['Sub-Total Bs', 'Base Exenta Bs', 'Base Imponible Bs', 'IVA (16%) Bs', 'Total a Pagar Bs'];
    const valsBs    = [data.header.SubTotalBs, data.header.BaseExentaBs, data.header.BaseImponibleBs, data.header.IVA_Bs, data.header.NetoBs];

    const xMidLeft  = xTot + totW / 2 - 2;
    const xMidRight = W - M - 2;
    let yTot = yPie - 9.5;
    const rowH = 5;

    for (let i = 0; i < labelsRef.length; i++) {
        const isBold = i === 4;
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.setFontSize(isBold ? 7 : 6);
        doc.text(labelsRef[i], xTot + 1, yTot);
        doc.text(valsRef[i],   xMidLeft, yTot, { align: 'right' });
        doc.text(labelsBs[i],  xTot + totW / 2 + 1, yTot);
        doc.text(valsBs[i],    xMidRight, yTot, { align: 'right' });
        yTot += rowH;
    }

    // Footer
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text('© RedesIP — Sistema de Pedidos Droguería Intercontinental', W / 2, H - 4, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    return doc.output('blob');
}
