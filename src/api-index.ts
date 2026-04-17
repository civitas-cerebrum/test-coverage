import * as ts from 'typescript';
import { isIgnored, isSourceFile, ProgramContext } from './program';
import { ApiIndex } from './types';

export function buildApiIndex(ctx: ProgramContext): ApiIndex {
  const apiIndex: ApiIndex = new Map();

  for (const sourceFile of ctx.program.getSourceFiles()) {
    const filePath = sourceFile.fileName;

    if (sourceFile.isDeclarationFile) continue;
    if (!isSourceFile(ctx, filePath)) continue;
    if (isIgnored(ctx, filePath)) continue;

    const visit = (node: ts.Node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const isExported = node.modifiers?.some(
          m => m.kind === ts.SyntaxKind.ExportKeyword,
        );

        if (!isExported) return;

        const className = node.name.text;
        const methods = new Set<string>();

        node.members.forEach(member => {
          let methodName: string | null = null;

          if (ts.isMethodDeclaration(member) && member.name) {
            methodName = member.name.getText(sourceFile);
          }

          if (
            ts.isPropertyDeclaration(member) &&
            member.name &&
            member.initializer &&
            ts.isArrowFunction(member.initializer)
          ) {
            methodName = member.name.getText(sourceFile);
          }

          if (!methodName) return;

          const isPrivate = hasNonPublicModifier(member);
          const isConstructor = methodName === 'constructor';
          const isInternal = methodName.startsWith('_');

          if (!isPrivate && !isConstructor && !isInternal) {
            methods.add(methodName);
          }
        });

        if (methods.size > 0) {
          apiIndex.set(className, methods);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  if (ctx.debug) {
    console.log(`[debug] API index built: ${apiIndex.size} classes`);
    apiIndex.forEach((methods, cls) =>
      console.log(`[debug]   ${cls}: [${[...methods].join(', ')}]`),
    );
  }

  return apiIndex;
}

function hasNonPublicModifier(member: ts.ClassElement): boolean {
  if (
    ts.isMethodDeclaration(member) ||
    ts.isPropertyDeclaration(member) ||
    ts.isConstructorDeclaration(member) ||
    ts.isGetAccessorDeclaration(member) ||
    ts.isSetAccessorDeclaration(member)
  ) {
    return !!member.modifiers?.some(
      m =>
        m.kind === ts.SyntaxKind.PrivateKeyword ||
        m.kind === ts.SyntaxKind.ProtectedKeyword,
    );
  }

  return false;
}
