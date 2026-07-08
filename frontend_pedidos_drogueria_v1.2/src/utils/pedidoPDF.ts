import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoEmpresaUrl from '../assets/drogueria_logo.png';

export interface LineaPDF {
    codigo: string | number;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    precioBase?: number;
    descuentos?: number[];
    sinDescuento?: boolean;
    esControlado?: boolean;
    diasProteccion?: number;
    porcentajeIva?: number;
    lote?: string;
    fechaVencimiento?: string;
}

export interface LineaConteoPDF {
    codarticulo: string | number;
    descripcion: string;
    cantPedida: number;
    cantContada: number;
    precio: number;
}

export interface ConteoPDFData {
    fechaConteo?: string | null;
    estadoConteo?: string | null;
    lineas: LineaConteoPDF[];
}

export interface PedidoPDFData {
    numeroOrden: string;
    fecha?: string;
    estatus?: string;
    cliente: {
        codcliente?: string | number;
        nombrecliente: string;
        nit?: string;
        direccionFiscal?: string;
        direccionEnvio?: string;
    };
    lineas: LineaPDF[];
    totalUSD: number;
    totalIVA?: number;
    ocultarPrecios?: boolean;
    esPsicotropico?: boolean;
    firmante?: { usuario: string; fecha: string };
    conteo?: ConteoPDFData;
}

export async function generarPedidoPDF(data: PedidoPDFData): Promise<void> {
    const doc = new jsPDF();

    // --- Logo ---
    try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = reject;
            img.src = logoEmpresaUrl;
        });
        doc.addImage(img, 'PNG', 14, 5, 42, 22);
    } catch { /* si falla, el PDF sigue sin logo */ }

    // --- Encabezado empresa ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('DROGUERIA INTERCONTINENTAL, C.A.', 62, 13);
    doc.setFontSize(9);
    doc.text('RIF: J501590192', 162, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('AV. CRUZ PERAZA LOCAL GALPON NRO 02 SECTOR LA\nCARBONERA MATURIN MONAGAS ZONA POSTAL 6201', 62, 18);
    doc.line(14, 30, 196, 30);

    // --- Cabecera del pedido ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('PEDIDO DE CLIENTE', 14, 38);
    doc.text(`N°: ${data.numeroOrden}`, 150, 38);

    // --- Datos del cliente ---
    doc.setFillColor(248, 248, 248);
    doc.rect(14, 41, 182, data.estatus ? 36 : 30, 'F');
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');

    const tz = { timeZone: 'America/Caracas' };
    const fechaTexto = data.fecha
        ? new Date(data.fecha).toLocaleString('es-VE', tz)
        : new Date().toLocaleDateString('es-VE', tz);
    doc.text(`Fecha: ${fechaTexto}`, 155, 46);
    doc.text(`ID Cliente: ${data.cliente.codcliente ?? '---'}`, 16, 46);

    doc.text('Razón Social:', 16, 52);
    doc.setFont('helvetica', 'bold');
    doc.text(data.cliente.nombrecliente || 'N/A', 40, 52);
    doc.setFont('helvetica', 'normal');

    doc.text(`RIF/CI: ${data.cliente.nit || 'N/A'}`, 155, 52);
    doc.text(`Dir. Fiscal:  ${data.cliente.direccionFiscal || 'N/A'}`, 16, 58);
    doc.text(`Dir. Envío:   ${data.cliente.direccionEnvio  || 'N/A'}`, 16, 63);

    let datosFin = 73;
    if (data.estatus) {
        doc.setFont('helvetica', 'bold');
        doc.text(`Estado: ${data.estatus}`, 16, 69);
        doc.setFont('helvetica', 'normal');
        datosFin = 78;
    }

    const maxDiasProteccion = Math.max(...data.lineas.map(l => l.diasProteccion ?? 0));
    const isPsico = data.esPsicotropico === true;
    doc.setFont('helvetica', 'bold');
    doc.text('Tipo:', 16, datosFin - 1);
    doc.setFont('helvetica', 'normal');
    doc.text(
        maxDiasProteccion > 0
            ? (isPsico ? 'Monto Factura' : `Monto Factura — NO INDEXADO (Protección proveedor: ${maxDiasProteccion} días)`)
            : (isPsico ? 'Indexado' : 'Monto Factura — Indexado'),
        30, datosFin - 1
    );

    // --- Tabla de líneas ---
    const sinPrecios = data.ocultarPrecios === true;

    let headCols: string[];
    const filas: any[][] = isPsico
        ? data.lineas.map(l => {
            if (sinPrecios) return [l.codigo, (l.descripcion || '') + (l.esControlado ? ' (CONTROLADO)' : ''),
                l.cantidad, l.lote || '', l.fechaVencimiento || ''];
            const descPct = (!l.sinDescuento && l.descuentos?.length) ? `${l.descuentos.join('%+')}%` : '';
            const pct = l.porcentajeIva ?? 0;
            return [l.codigo, (l.descripcion || '') + (l.esControlado ? ' (CONTROLADO)' : ''),
                l.cantidad, '', '', '', descPct, pct > 0 ? `+${pct}%` : '',
                l.precioUnitario.toFixed(2), (l.precioUnitario * l.cantidad).toFixed(2)];
        })
        : data.lineas.map(l => {
            const descPct = (!sinPrecios && !l.sinDescuento && l.descuentos?.length) ? `${l.descuentos.join('%+')}%` : '';
            const pct = l.porcentajeIva ?? 0;
            const ivaTag = (!sinPrecios && pct > 0) ? `+${pct}%` : '';
            const row: any[] = [l.codigo, (l.descripcion || '') + (l.esControlado ? ' (CONTROLADO)' : ''),
                l.cantidad, (l.diasProteccion ?? 0) > 0 ? `${l.diasProteccion}d NI` : '', '', '', '', descPct];
            if (!sinPrecios) { row.push(ivaTag); row.push(l.precioUnitario.toFixed(2)); row.push((l.precioUnitario * l.cantidad).toFixed(2)); }
            return row;
        });

    if (isPsico) {
        headCols = sinPrecios
            ? ['Código', 'Descripción', 'Cant.', 'Lote', 'Venc.']
            : ['Código', 'Descripción', 'Cant.', 'ESC PRD', 'ESC PRD', 'ESC PRV', 'DESC.', 'IVA', 'Precio', 'Importe'];
    } else {
        headCols = sinPrecios
            ? ['Código', 'Descripción', 'Cant.', 'Seg.', 'ESC PRD', 'ESC PRD', 'ESC PRV', 'DESC.']
            : ['Código', 'Descripción', 'Cant.', 'Seg.', 'ESC PRD', 'ESC PRD', 'ESC PRV', 'DESC.', 'IVA', 'Precio', 'Importe'];
    }

    autoTable(doc, {
        startY: datosFin + 5,
        head: [headCols],
        body: filas,
        theme: 'plain',
        styles: { fontSize: 7, cellPadding: 1 },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
        columnStyles: isPsico ? {
            0: { cellWidth: 18 },
            1: { cellWidth: sinPrecios ? 80 : 48 },
            ...(sinPrecios ? {
                3: { cellWidth: 30 },
                4: { cellWidth: 22, halign: 'center' as const },
            } : {
                7:  { cellWidth: 10, halign: 'center' as const },
                8:  { halign: 'right' as const },
                9:  { halign: 'right' as const },
            }),
        } : {
            0: { cellWidth: 18 },
            1: { cellWidth: sinPrecios ? 80 : 48 },
            ...(sinPrecios ? {} : {
                8:  { cellWidth: 10, halign: 'center' as const },
                9:  { halign: 'right' as const },
                10: { halign: 'right' as const },
            }),
        },
    });

    // --- Totales (solo con precios) ---
    const finalY = (doc as any).lastAutoTable.finalY + 6;
    if (!sinPrecios) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.rect(50, finalY, 146, 8);
        doc.text('TOTAL NETO:    USD:', 130, finalY + 5.5);
        doc.text(data.totalUSD.toFixed(2), 192, finalY + 5.5, { align: 'right' });
    }

    // --- Footer farmacéutico (solo psicotrópicos) + firmante ---
    const pageH = doc.internal.pageSize.getHeight();
    let sigLineY: number;
    if (isPsico) {
        const farmY = finalY + (sinPrecios ? 8 : 18);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.text('DROGUERÍA INTERCONTINENTAL, C.A.', 105, farmY, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.text('FARMACÉUTICO: Laura Navas', 105, farmY + 5, { align: 'center' });
        doc.text('C.I: V-9.283.327', 105, farmY + 10, { align: 'center' });
        doc.text('M.P.P.S: 6384   COLFAR: 198   INPREFAR: 141411754', 105, farmY + 15, { align: 'center' });
        sigLineY = farmY + 25;
    } else {
        sigLineY = sinPrecios ? finalY + 10 : finalY + 38;
    }

    // --- Firmante (opcional) ---
    if (data.firmante) {
        doc.setFontSize(8);
        doc.setDrawColor(180);
        doc.line(14, sigLineY, 90, sigLineY);
        doc.setFont('helvetica', 'bold');
        doc.text(data.firmante.usuario, 14, sigLineY + 5);
        doc.setFont('helvetica', 'normal');
        doc.text(`Emitido: ${data.firmante.fecha}`, 14, sigLineY + 10);
    }

    // --- Sección de conteo (solo si viene data) ---
    if (data.conteo) {
        const conteoStartY = (doc as any).lastAutoTable.finalY + (data.firmante ? 20 : 10);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('CONTEO DE ALMACÉN', 14, conteoStartY);
        if (data.conteo.fechaConteo) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.text(`Fecha conteo: ${data.conteo.fechaConteo}   Estado: ${data.conteo.estadoConteo ?? '—'}`, 14, conteoStartY + 6);
        }
        autoTable(doc, {
            startY: conteoStartY + 10,
            head: [['Código', 'Descripción', 'Pedido', 'Contado', 'Dif.', 'Precio Unit.']],
            body: data.conteo.lineas.map(l => {
                const dif = l.cantContada - l.cantPedida;
                return [
                    l.codarticulo,
                    l.descripcion,
                    l.cantPedida,
                    l.cantContada,
                    dif === 0 ? '—' : (dif > 0 ? `+${dif}` : String(dif)),
                    l.precio.toFixed(2),
                ];
            }),
            theme: 'plain',
            styles: { fontSize: 7, cellPadding: 1 },
            headStyles: { fillColor: [230, 245, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
            bodyStyles: { lineWidth: 0.05 },
            columnStyles: {
                0: { cellWidth: 18 },
                1: { cellWidth: 80 },
                2: { halign: 'center' as const, cellWidth: 18 },
                3: { halign: 'center' as const, cellWidth: 18 },
                4: { halign: 'center' as const, cellWidth: 14 },
                5: { halign: 'right'  as const },
            },
            didParseCell: (hookData: any) => {
                if (hookData.section === 'body' && hookData.column.index === 4) {
                    const v = String(hookData.cell.raw);
                    if (v.startsWith('+')) hookData.cell.styles.textColor = [0, 150, 0];
                    else if (v.startsWith('-')) hookData.cell.styles.textColor = [200, 0, 0];
                }
            },
        });
    }

    // Copyright footer
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150);
    doc.text('© RedesIP — Sistema de Pedidos Droguería Intercontinental', 105, pageH - 5, { align: 'center' });
    doc.setTextColor(0);

    doc.save(`Pedido_${data.numeroOrden}.pdf`);
}
