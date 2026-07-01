export class encriptacion {
    static desEncriptar(sEncriptado: string): string {
        let sReturn: string = "";
        const iConstantes: Array<number> = [78, 79, 82, 77, 65, 76, 75, 69, 89, 78, 79, 82, 77, 65, 76, 75, 69, 89, 78, 79, 82, 77, 65, 76, 75, 69, 89, 78, 79, 82, 77, 65, 76, 75, 69, 89, 78];
        let j: number = 0;

        for (let i: number = 0; i < sEncriptado.length; i += 2) {
            // Asegúrate de que j no exceda la longitud de iConstantes.
            // Aunque tu array iConstantes es bastante largo, es buena práctica.
            const constante = iConstantes[j % iConstantes.length]; 
            
            sReturn += String.fromCharCode(parseInt(sEncriptado.substring(i, i + 2), 16) - constante);
            j++;
        }

        return sReturn;
    }

    static encriptar(sEncriptar: string): string {
        let sReturn: string = "";
        const iConstantes: Array<number> = [78, 79, 82, 77, 65, 76, 75, 69, 89, 78, 79, 82, 77, 65, 76, 75, 69, 89, 78, 79, 82, 77, 65, 76, 75, 69, 89, 78, 79, 82, 77, 65, 76, 75, 69, 89, 78];

        for (let i: number = 0; i < sEncriptar.length; i++) {
            // Asegúrate de que i no exceda la longitud de iConstantes.
            const constante = iConstantes[i % iConstantes.length];

            sReturn += (sEncriptar.charCodeAt(i) + constante).toString(16).toUpperCase();
        }

        return sReturn;
    }
}