import * as ts from 'typescript';
import { AnalyzerConfig } from '../types';

export class TypeScriptParser {
  private _program: ts.Program;
  private _printer: ts.Printer;

  constructor(files: string[], options?: AnalyzerConfig) {
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.CommonJS,
      declaration: true,
      ...options?.compilerOptions,
    };

    this._program = ts.createProgram(files, compilerOptions);
    this._printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  }

  public getRootFileNames(): string[] {
    return Array.from(this._program.getRootFileNames());
  }

  public getSourceFile(fileName: string): ts.SourceFile | undefined {
    return this._program.getSourceFile(fileName);
  }

  public getTypeChecker(): ts.TypeChecker {
    return this._program.getTypeChecker();
  }

  public getExportedDeclarations(sourceFile: ts.SourceFile): ts.Declaration[] {
    const result: ts.Declaration[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isVariableStatement(node)
      ) {
        if (this.isExported(node)) {
          if (ts.isVariableStatement(node)) {
            result.push(...node.declarationList.declarations);
          } else {
            result.push(node);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return result;
  }

  private isExported(node: ts.Node): boolean {
    if (ts.canHaveModifiers(node)) {
      const modifiers = ts.getModifiers(node);
      return (
        modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
      );
    }
    return false;
  }

  public isComplexType(type: ts.Type): boolean {
    return (
      this.isGenericType(type) ||
      this.isConditionalType(type) ||
      this.isMappedType(type) ||
      this.isUnionOrIntersectionType(type)
    );
  }

  public isGenericType(type: ts.Type): boolean {
    return !!(type.flags & ts.TypeFlags.TypeParameter);
  }

  public isConditionalType(type: ts.Type): boolean {
    return !!(type.flags & ts.TypeFlags.Conditional);
  }

  public isMappedType(type: ts.Type): boolean {
    if (!(type.flags & ts.TypeFlags.Object)) {
      return false;
    }
    const objectType = type as ts.ObjectType;
    return !!(objectType.objectFlags & ts.ObjectFlags.Mapped);
  }

  public isUnionOrIntersectionType(type: ts.Type): boolean {
    return !!(type.flags & (ts.TypeFlags.Union | ts.TypeFlags.Intersection));
  }

  public getTypeArguments(type: ts.Type): ts.Type[] {
    if (type.isTypeParameter()) {
      const constraint = type.getConstraint();
      return constraint ? [constraint] : [];
    }
    return [];
  }

  public getConstraintType(type: ts.Type): ts.Type | undefined {
    if (type.isTypeParameter()) {
      return type.getConstraint();
    }
    return undefined;
  }

  /**
   * Safely gets the text of a TypeScript node.
   * Falls back to using a printer if direct getText() fails.
   */
  public getNodeText(node: ts.Node): string {
    if (!node) {
      return '';
    }

    try {
      // Try the direct method first
      return node.getText().trim();
    } catch (error) {
      try {
        // If direct getText fails, try to use the printer API
        const sourceFile = node.getSourceFile();
        if (sourceFile) {
          return this._printer.printNode(ts.EmitHint.Unspecified, node, sourceFile).trim();
        }
      } catch (printError) {
        // Silent fail and continue to fallbacks
      }

      // Special case handling based on node kind
      if (ts.isIdentifier(node)) {
        return node.escapedText.toString();
      } else if (ts.isPropertySignature(node) || ts.isMethodSignature(node)) {
        if (ts.isIdentifier(node.name)) {
          return node.name.escapedText.toString();
        }
      } else if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
        return node.typeName.escapedText.toString();
      }

      // Last resort
      return `${ts.SyntaxKind[node.kind]}`;
    }
  }

  public getNodePosition(node: ts.Node): { line: number; column: number } {
    try {
      const sourceFile = node.getSourceFile();
      const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      return {
        line: pos.line + 1,
        column: pos.character + 1,
      };
    } catch (error) {
      // Return a default position if we can't get the actual position
      return {
        line: 0,
        column: 0,
      };
    }
  }
}
