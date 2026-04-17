import * as ts from 'typescript';
import { extractTypedCalls } from './call-detection';
import { isIgnored, isSourceFile, ProgramContext } from './program';
import { ApiIndex, MethodKey } from './types';

export function buildCallGraph(
  ctx: ProgramContext,
  checker: ts.TypeChecker,
  apiIndex: ApiIndex,
): Map<MethodKey, Set<MethodKey>> {
  const callGraph = new Map<MethodKey, Set<MethodKey>>();

  apiIndex.forEach((methods, className) => {
    methods.forEach(m => callGraph.set(`${className}.${m}` as MethodKey, new Set()));
  });

  for (const sourceFile of ctx.program.getSourceFiles()) {
    const filePath = sourceFile.fileName;

    if (sourceFile.isDeclarationFile) continue;
    if (!isSourceFile(ctx, filePath)) continue;
    if (isIgnored(ctx, filePath)) continue;

    const visit = (node: ts.Node) => {
      let currentMethodKey: MethodKey | null = null;

      if (
        ts.isMethodDeclaration(node) &&
        node.name &&
        node.parent &&
        ts.isClassDeclaration(node.parent) &&
        node.parent.name
      ) {
        const className = node.parent.name.text;
        const methodName = node.name.getText(sourceFile);
        if (apiIndex.has(className) && apiIndex.get(className)!.has(methodName)) {
          currentMethodKey = `${className}.${methodName}` as MethodKey;
        }
      } else if (
        ts.isPropertyDeclaration(node) &&
        node.initializer &&
        ts.isArrowFunction(node.initializer) &&
        node.name &&
        node.parent &&
        ts.isClassDeclaration(node.parent) &&
        node.parent.name
      ) {
        const className = node.parent.name.text;
        const methodName = node.name.getText(sourceFile);
        if (apiIndex.has(className) && apiIndex.get(className)!.has(methodName)) {
          currentMethodKey = `${className}.${methodName}` as MethodKey;
        }
      }

      if (currentMethodKey) {
        const internalCalls = extractTypedCalls(node, sourceFile, checker, apiIndex, ctx.debug);

        const edges = callGraph.get(currentMethodKey)!;
        internalCalls.forEach(call => {
          if (call !== currentMethodKey) {
            edges.add(call);
          }
        });

        return;
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  if (ctx.debug) {
    console.log(`[debug] Internal call graph built. Ready for transitive resolution.`);
  }

  return callGraph;
}

export function resolveTransitiveCalls(
  directlyCalled: Set<MethodKey>,
  callGraph: Map<MethodKey, Set<MethodKey>>,
): Set<MethodKey> {
  const called = new Set(directlyCalled);
  const queue = Array.from(directlyCalled);

  while (queue.length > 0) {
    const currentMethod = queue.shift()!;
    const deps = callGraph.get(currentMethod);
    if (!deps) continue;
    for (const dep of deps) {
      if (!called.has(dep)) {
        called.add(dep);
        queue.push(dep);
      }
    }
  }

  return called;
}
