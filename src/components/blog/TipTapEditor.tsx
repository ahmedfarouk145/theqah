// src/components/blog/TipTapEditor.tsx
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import ImageExtension from '@tiptap/extension-image';
import LinkExtension from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef, useState } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// Use `blogStorage` (bound to the `blog` Firebase app), not the default
// `storage`. The blog editor signs in via `blogAuth`, so only `blogStorage`
// carries the right auth token to satisfy Storage Rules for /blog/*.
import { blogStorage } from '@/lib/firebase';

interface Props {
    content: string;
    onChange: (html: string) => void;
}

export default function TipTapEditor({ content, onChange }: Props) {
    const [uploading, setUploading] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const editor = useEditor({
        // Tiptap's default initial render runs eagerly on the server and
        // diverges from the client DOM → hydration mismatch. Deferring to
        // after mount is the officially recommended fix for Next.js.
        immediatelyRender: false,
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
        imageInputRef.current?.click();
    };

    const handleImageUpload = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            alert('يرجى اختيار ملف صورة');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert('حجم الصورة يجب أن يكون أقل من 5 ميجابايت');
            return;
        }
        setUploading(true);
        try {
            const ext = file.name.split('.').pop() || 'jpg';
            const storageRef = ref(blogStorage, `blog/content/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
            await uploadBytes(storageRef, file, { contentType: file.type });
            const url = await getDownloadURL(storageRef);
            editor.chain().focus().setImage({ src: url }).run();
        } catch (err) {
            console.error('Image upload error:', err);
            // Surface the real error code so misconfigurations (auth, rules,
            // CORS, quota) are visible to the user without opening devtools.
            const code = (err as { code?: string })?.code || '';
            const message = (err as { message?: string })?.message || String(err);
            alert(`خطأ في رفع الصورة${code ? ` (${code})` : ''}: ${message}`);
        } finally {
            setUploading(false);
        }
    };

    const addLink = () => {
        const url = prompt('أدخل الرابط:');
        if (url) {
            editor.chain().focus().setLink({ href: url }).run();
        }
    };

    return (
        <div className="border border-gray-300 rounded-xl overflow-hidden bg-white relative">
            {/* Hidden file input for image upload */}
            <input
                type="file"
                ref={imageInputRef}
                accept="image/*"
                className="hidden"
                aria-label="رفع صورة"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                    e.target.value = '';
                }}
            />

            {/* Uploading overlay */}
            {uploading && (
                <div className="absolute inset-0 bg-white/70 z-20 flex items-center justify-center gap-2 rounded-xl">
                    <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-green-700 font-medium">جاري رفع الصورة...</span>
                </div>
            )}

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
                <ToolbarBtn active={false} onClick={addImage} title="رفع صورة">
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
