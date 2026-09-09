import type { Editor } from "@tiptap/react";
import { Bold, Italic, Underline as UnderlineIcon, Quote, Minus, AlignLeft, AlignCenter, Undo2, Redo2, Search } from "lucide-react";

export function EditorToolbar({ editor, onFindReplace }: { editor: Editor; onFindReplace: () => void }) {
  return (
    <div className="iw-ms-toolbar" role="toolbar" aria-label="Formatting">
      <button
        type="button"
        aria-label="Bold"
        aria-pressed={editor.isActive("bold")}
        className={editor.isActive("bold") ? "active" : ""}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={16} />
      </button>
      <button
        type="button"
        aria-label="Italic"
        aria-pressed={editor.isActive("italic")}
        className={editor.isActive("italic") ? "active" : ""}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={16} />
      </button>
      <button
        type="button"
        aria-label="Underline"
        aria-pressed={editor.isActive("underline")}
        className={editor.isActive("underline") ? "active" : ""}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon size={16} />
      </button>
      <button
        type="button"
        aria-label="Block quote"
        aria-pressed={editor.isActive("blockquote")}
        className={editor.isActive("blockquote") ? "active" : ""}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote size={16} />
      </button>
      <button type="button" aria-label="Insert scene break" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus size={16} />
      </button>
      <button
        type="button"
        aria-label="Align left"
        aria-pressed={editor.isActive({ textAlign: "left" })}
        className={editor.isActive({ textAlign: "left" }) ? "active" : ""}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        <AlignLeft size={16} />
      </button>
      <button
        type="button"
        aria-label="Align center"
        aria-pressed={editor.isActive({ textAlign: "center" })}
        className={editor.isActive({ textAlign: "center" }) ? "active" : ""}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        <AlignCenter size={16} />
      </button>
      <button type="button" aria-label="Undo" onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 size={16} />
      </button>
      <button type="button" aria-label="Redo" onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 size={16} />
      </button>
      <button type="button" aria-label="Find and replace" onClick={onFindReplace}>
        <Search size={16} />
      </button>
    </div>
  );
}
