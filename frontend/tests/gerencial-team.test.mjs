import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import moduleBuiltin from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import ReactDOMServer from "react-dom/server";

const Module = moduleBuiltin.Module || moduleBuiltin;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "..");

function requireTsModule(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  });
  const mod = new Module(filePath);
  mod.filename = filePath;
  mod.paths = Module._nodeModulePaths(path.dirname(filePath));
  mod._compile(outputText, filePath);
  return mod.exports;
}

test("Equipe renderiza subguia Administradores e Vendedores", () => {
  const TeamListPanel = requireTsModule(path.join(frontendRoot, "src/app/gerencial/_components/TeamListPanel.tsx")).default;
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      TeamListPanel,
      {
        showDesktopTeam: true,
        showDesktopModules: false,
        companyId: 7,
        enabledModulesCount: 3,
        usersCount: 2,
        userSearch: "",
        setUserSearch: () => {},
        userFilter: "active",
        setUserFilter: () => {},
        teamRoleTab: "admins",
        setTeamRoleTab: () => {},
        adminCount: 1,
        sellerCount: 1,
        onCreateAccess: () => {},
      },
      React.createElement("div", null, "Lista"),
    ),
  );

  assert.match(html, /Administradores/);
  assert.match(html, /Vendedores/);
});

test("usuário logado não usa ação de excluir a si mesmo", () => {
  const guards = requireTsModule(path.join(frontendRoot, "src/app/gerencial/_components/team-access-guards.ts"));

  assert.equal(
    guards.getTeamAccessActionBlockMessage({ id: 5, role: "ADMIN", isSystemMaster: false }, 5, "delete"),
    guards.SELF_ACCESS_MESSAGE,
  );
});

test("erro de último admin aparece de forma legível", () => {
  const guards = requireTsModule(path.join(frontendRoot, "src/app/gerencial/_components/team-access-guards.ts"));

  assert.equal(
    guards.normalizeGerencialTeamError("Bad Request: A empresa precisa manter pelo menos um administrador ativo."),
    guards.LAST_ADMIN_MESSAGE,
  );
});
