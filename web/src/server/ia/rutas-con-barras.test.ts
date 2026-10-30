import { describe, expect, it } from "vitest";
import { rutasConBarras } from "./revisar";

describe("rutasConBarras", () => {
  it("pasa las rutas de Windows del prompt a «/»: Git Bash se come las «\\» y creaba carpetas C:Usersusuario… en la raíz", () => {
    const dir = "C:\\Users\\usuario\\servidor_app_util\\precheck-mupa-informe\\web\\.data\\prechecks\\pck-1";
    expect(rutasConBarras(`- Archivos temporales: solo en ${dir}\\tmp (créala si no existe).`)).toBe(
      "- Archivos temporales: solo en C:/Users/usuario/servidor_app_util/precheck-mupa-informe/web/.data/prechecks/pck-1/tmp (créala si no existe).",
    );
    expect(rutasConBarras(`usa \`C:\\venv\\python.exe\` y r'${dir}\\plano.pdf'`)).toBe(
      "usa `C:/venv/python.exe` y r'C:/Users/usuario/servidor_app_util/precheck-mupa-informe/web/.data/prechecks/pck-1/plano.pdf'",
    );
  });

  it("no toca rutas que ya usan «/» ni texto sin rutas", () => {
    expect(rutasConBarras("/home/app/precheck y «tercer» \\n")).toBe("/home/app/precheck y «tercer» \\n");
  });
});
