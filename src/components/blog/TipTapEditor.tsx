// src/components/blog/TipTapEditor.tsx
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import ImageExtension from '@tiptap/extension-image';
import LinkExtension from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect } from 'react';

interface Props {
    content: string;
    onChange: (html: string) => void;
}

export default function TipTapEditor({ content, onChange }: Props) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [2, 3] },
            }),
            ImageExtension.configure({
                HTMLAttributes: { class: 'rounded-xl shadow-md max-w-full mx-auto' },
            }),
            LinkExtension.configure({
                openOnClick: false,
                HTMLAttributes: { class: 'text-green-700 underline' },
            }),
            Placeholder.configure({
                placeholder: 'ابدأ الكتابة هنا...',
            }),
        ],
        content: content || '',
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class: 'prose prose-green dark:prose-invert max-w-none focus:outline-none min-h-[300px] px-4 py-3',
                dir: 'rtl',
            },
        },
    });

    // Sync external content changes (e.g. when editing a different post)
    useEffect(() => {
        if (editor && content !== editor.getHTML()) {
            editor.commands.setContent(content || '');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [content]);

    if (!editor) return null;

    const addImage = () => {
        const url = prompt('أدخل رابط الصورة:');
        if (url) {
            editor.chain().focus().setImage({ src: url }).run();
        }
    };

    const addLink = () => {
        const url = prompt('أدخل الرابط:');
        if (url) {
            editor.chain().focus().setLink({ href: url }).run();
        }
    };

    return (
        <div className="border border-gray-300 rounded-xl overflow-hidden bg-white">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-1 px-3 py-2 bg-gray-50 border-b border-gray-200">
                <ToolbarBtn
                    active={editor.isActive('bold')}
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    title="تسميك"
                >
                    <strong>B</strong>
                </ToolbarBtn>
                <ToolbarBtn
                    active={editor.isActive('italic')}
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    title="مائل"
                >
                    <em>I</em>
                </ToolbarBtn>

                <div className="w-px h-6 bg-gray-300 mx-1" />

                <ToolbarBtn
                    active={editor.isActive('heading', { level: 2 })}
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    title="عنوان كبير"
                >
                    H2
                </ToolbarBtn>
                <ToolbarBtn
                    active={editor.isActive('heading', { level: 3 })}
                    onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                    title="عنوان صغير"
                >
                    H3
                </ToolbarBtn>

                <div className="w-px h-6 bg-gray-300 mx-1" />

                <ToolbarBtn
                    active={editor.isActive('bulletList')}
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    title="قائمة نقطية"
                >
                    •
                </ToolbarBtn>
                <ToolbarBtn
                    active={editor.isActive('orderedList')}
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    title="قائمة مرقمة"
                >
                    1.
                </ToolbarBtn>

                <div className="w-px h-6 bg-gray-300 mx-1" />

                <ToolbarBtn
                    active={editor.isActive('blockquote')}
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    title="اقتباس"
                >
                    ❝
                </ToolbarBtn>

                <ToolbarBtn active={false} onClick={addLink} title="رابط">
                    🔗
                </ToolbarBtn>
                <ToolbarBtn active={false} onClick={addImage} title="صورة">
                    🖼️
                </ToolbarBtn>

                <div className="w-px h-6 bg-gray-300 mx-1" />

                <ToolbarBtn
                    active={false}
                    onClick={() => editor.chain().focus().undo().run()}
                    title="تراجع"
                >
                    ↩
                </ToolbarBtn>
                <ToolbarBtn
                    active={false}
                    onClick={() => editor.chain().focus().redo().run()}
                    title="إعادة"
                >
                    ↪
                </ToolbarBtn>
            </div>

            {/* Editor Content */}
            <EditorContent editor={editor} />
        </div>
    );
}

function ToolbarBtn({
    children,
    active,
    onClick,
    title,
}: {
    children: React.ReactNode;
    active: boolean;
    onClick: () => void;
    title: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={`w-8 h-8 flex items-center justify-center rounded-md text-sm font-medium transition-colors ${active
                ? 'bg-green-100 text-green-800 border border-green-300'
                : 'text-gray-600 hover:bg-gray-200'}`}
        >
            {children}
        </button>
    );
}
