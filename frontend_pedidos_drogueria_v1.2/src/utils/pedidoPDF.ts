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
    ocultarPrecios?: boolean;
    firmante?: { usuario: string; fecha: string };
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
    doc.setFont('helvetica', 'bold');
    doc.text('Tipo:', 16, datosFin - 1);
    doc.setFont('helvetica', 'normal');
    doc.text(
        maxDiasProteccion > 0
            ? `Monto Factura — NO INDEXADO (Protección proveedor: ${maxDiasProteccion} días)`
            : 'Monto Factura — Indexado',
        30, datosFin - 1
    );

    // --- Tabla de líneas ---
    const sinPrecios = data.ocultarPrecios === true;

    const filas = data.lineas.map(l => {
        const descPct = (!sinPrecios && !l.sinDescuento && l.descuentos?.length) ? `${l.descuentos.join('%+')}%` : '';
        const row: any[] = [
            l.codigo,
            (l.descripcion || '') + (l.esControlado ? ' (CONTROLADO)' : ''),
            l.cantidad,
            (l.diasProteccion ?? 0) > 0 ? `${l.diasProteccion}d NI` : '',
            '', '', '',
            descPct,
        ];
        if (!sinPrecios) {
            row.push(l.precioUnitario.toFixed(2));
            row.push((l.precioUnitario * l.cantidad).toFixed(2));
        }
        return row;
    });

    const headCols = sinPrecios
        ? ['Código', 'Descripción', 'Cant.', 'Seg.', 'ESC PRD', 'ESC PRD', 'ESC PRV', 'DESC.']
        : ['Código', 'Descripción', 'Cant.', 'Seg.', 'ESC PRD', 'ESC PRD', 'ESC PRV', 'DESC.', 'Precio', 'Importe'];

    autoTable(doc, {
        startY: datosFin + 5,
        head: [headCols],
        body: filas,
        theme: 'plain',
        styles: { fontSize: 7, cellPadding: 1 },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
        columnStyles: {
            0: { cellWidth: 18 },
            1: { cellWidth: sinPrecios ? 80 : 52 },
            ...(sinPrecios ? {} : { 8: { halign: 'right' as const }, 9: { halign: 'right' as const } }),
        },
    });

    // --- Totales (solo con precios) ---
    const finalY = (doc as any).lastAutoTable.finalY + 6;
    if (!sinPrecios) {
        doc.setFont('helvetica', 'normal');
        doc.rect(50, finalY, 146, 6);
        doc.text('Monto Total de la Base Imponible según Alícuota: USD:', 86, finalY + 4.5);
        doc.text(data.totalUSD.toFixed(2), 192, finalY + 4.5, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.rect(50, finalY + 12, 146, 8);
        doc.text('VALOR TOTAL:    USD:', 132, finalY + 17.5);
        doc.text(data.totalUSD.toFixed(2), 192, finalY + 17.5, { align: 'right' });
    }

    // --- Firmante (opcional) ---
    const pageH = doc.internal.pageSize.getHeight();
    if (data.firmante) {
        const firmaY = sinPrecios ? finalY + 10 : finalY + 30;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setDrawColor(180);
        doc.line(14, firmaY, 90, firmaY);
        doc.setFont('helvetica', 'bold');
        doc.text(data.firmante.usuario, 14, firmaY + 5);
        doc.setFont('helvetica', 'normal');
        doc.text(`Emitido: ${data.firmante.fecha}`, 14, firmaY + 10);
    }

    // Copyright footer
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150);
    doc.text('© RedesIP — Sistema de Pedidos Droguería Intercontinental', 105, pageH - 5, { align: 'center' });
    doc.setTextColor(0);

    doc.save(`Pedido_${data.numeroOrden}.pdf`);
}
