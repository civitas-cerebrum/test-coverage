import * as ts from 'typescript';
import { ApiIndex, MethodKey } from './types';

export function extractTypedCalls(
  nodeToScan: ts.Node,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  apiIndex: ApiIndex,
  debug: boolean,
): Set<MethodKey> {
  const calls = new Set<MethodKey>();

  const tryMatchClass = (className: string, methodName: string): boolean => {
    if (apiIndex.has(className) && apiIndex.get(className)!.has(methodName)) {
      calls.add(`${className}.${methodName}` as MethodKey);
      return true;
    }
    return false;
  };

  const matchTypeHierarchy = (type: ts.Type, methodName: string): boolean => {
    const symbol = checker.getApparentType(type).getSymbol();
    if (!symbol) return false;

    for (const decl of symbol.getDeclarations() ?? []) {
      if (ts.isClassDeclaration(decl) && decl.name) {
        if (tryMatchClass(decl.name.text, methodName)) return true;
      }
    }

    if (type.isClassOrInterface()) {
      for (const base of checker.getBaseTypes(type as ts.InterfaceType)) {
        if (matchTypeHierarchy(base, methodName)) return true;
      }
    }

    return false;
  };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression)) {
        const methodName = node.expression.name.getText().replace(/['"]/g, '');

        const signature = checker.getResolvedSignature(node);
        const decl = signature?.getDeclaration();

        if (decl && ts.isMethodDeclaration(decl)) {
          const parent = decl.parent;
          if (ts.isClassDeclaration(parent) && parent.name) {
            if (tryMatchClass(parent.name.text, methodName)) {
              ts.forEachChild(node, visit);
              return;
            }
          }
        }

        const obj = node.expression.expression;
        const type = checker.getTypeAtLocation(obj);

        if (matchTypeHierarchy(type, methodName)) {
          ts.forEachChild(node, visit);
          return;
        }

        for (const [className, methods] of apiIndex.entries()) {
          if (methods.has(methodName)) {
            if (debug) {
              console.log(
                `[debug] name-only match: ${className}.${methodName} in ${sourceFile.fileName}`,
              );
            }
            calls.add(`${className}.${methodName}` as MethodKey);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(nodeToScan);
  return calls;
}
