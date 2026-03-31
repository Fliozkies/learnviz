"use client";
import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  ReactNode,
  useState,
  useMemo,
} from "react";
import { Curriculum } from "@/types/curriculum";
import {
  CurriculumPatch,
  UndoStack,
  applyPatches,
  downloadCurriculum,
} from "@/lib/curriculumEditor";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditState {
  curriculum: Curriculum;
  editMode: boolean;
  isDirty: boolean; // has unsaved changes vs original
  changeCount: number;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
}

type EditAction =
  | { type: "TOGGLE_EDIT_MODE" }
  | { type: "APPLY_PATCHES"; patches: CurriculumPatch[]; label: string }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "SAVE" }; // marks as not dirty (after download)

interface EditCtx {
  state: EditState;
  toggleEditMode: () => void;
  applyEdit: (patches: CurriculumPatch[], label: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
  saveAsJson: (filename: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const Ctx = createContext<EditCtx | null>(null);

// ─── Reducer ──────────────────────────────────────────────────────────────────
// The UndoStack is created once per provider instance and closed over by the reducer.
// The reducer only reads the stack inside the action handlers, which is safe.

function stackSnapshot(stack: UndoStack) {
  return {
    canUndo: stack.canUndo(),
    canRedo: stack.canRedo(),
    undoLabel: stack.undoLabel(),
    redoLabel: stack.redoLabel(),
  };
}

function makeReducer(stack: UndoStack) {
  return function reducer(state: EditState, action: EditAction): EditState {
    switch (action.type) {
      case "TOGGLE_EDIT_MODE":
        return { ...state, editMode: !state.editMode };

      case "APPLY_PATCHES": {
        const { next, inversePatches } = applyPatches(
          state.curriculum,
          action.patches,
        );
        stack.push({
          patches: action.patches,
          inversePatches,
          label: action.label,
          timestamp: Date.now(),
        });
        return {
          ...state,
          curriculum: next,
          isDirty: true,
          changeCount: state.changeCount + action.patches.length,
          ...stackSnapshot(stack),
        };
      }

      case "UNDO": {
        const result = stack.undo(state.curriculum);
        if (!result) return state;
        return {
          ...state,
          curriculum: result.next,
          isDirty: stack.canUndo(),
          changeCount: Math.max(0, state.changeCount - 1),
          ...stackSnapshot(stack),
        };
      }

      case "REDO": {
        const result = stack.redo(state.curriculum);
        if (!result) return state;
        return {
          ...state,
          curriculum: result.next,
          isDirty: true,
          changeCount: state.changeCount + 1,
          ...stackSnapshot(stack),
        };
      }

      case "SAVE":
        return { ...state, isDirty: false };

      default:
        return state;
    }
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function EditProvider({
  children,
  initialCurriculum,
}: {
  children: ReactNode;
  initialCurriculum: Curriculum;
}) {
  // Create the UndoStack once using lazy initialization in useState.
  // The initializer runs only once, and the stack reference never changes.
  const [stack] = useState(() => new UndoStack());

  // Create the reducer once, closing over the stable stack.
  const reducer = useMemo(() => makeReducer(stack), [stack]);

  const [state, dispatch] = useReducer(reducer, {
    curriculum: initialCurriculum,
    editMode: false,
    isDirty: false,
    changeCount: 0,
    canUndo: false,
    canRedo: false,
    undoLabel: "",
    redoLabel: "",
  });

  // Keyboard shortcuts: Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z = redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: "UNDO" });
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        dispatch({ type: "REDO" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const toggleEditMode = useCallback(
    () => dispatch({ type: "TOGGLE_EDIT_MODE" }),
    [],
  );

  const applyEdit = useCallback((patches: CurriculumPatch[], label: string) => {
    dispatch({ type: "APPLY_PATCHES", patches, label });
  }, []);

  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);

  const saveAsJson = useCallback(
    (filename: string) => {
      downloadCurriculum(state.curriculum, filename);
      dispatch({ type: "SAVE" });
    },
    [state.curriculum],
  );

  return (
    <Ctx.Provider
      value={{
        state,
        toggleEditMode,
        applyEdit,
        undo,
        redo,
        canUndo: state.canUndo,
        canRedo: state.canRedo,
        undoLabel: state.undoLabel,
        redoLabel: state.redoLabel,
        saveAsJson,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useEditor() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useEditor must be used inside EditProvider");
  return ctx;
}
