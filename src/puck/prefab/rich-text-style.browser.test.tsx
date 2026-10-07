import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Heading from '@tiptap/extension-heading';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { afterEach, describe, expect, it } from 'vitest';
import { RichTextStyle } from './rich-text-style';

let editor: Editor | undefined;

function makeEditor(content: string) {
    editor = new Editor({ extensions: [Document, Paragraph, Text, Heading, RichTextStyle], content });
    return editor;
}

afterEach(() => editor?.destroy());

describe('RichTextStyle', () => {
    it('keeps a valid text style on paragraphs and headings, and drops anything else', () => {
        const html = makeEditor('<p data-text-style="eyebrow">a</p><h2 data-text-style="pull-quote">b</h2><p data-text-style="Not An Id">c</p>').getHTML();

        expect(html).toBe('<p data-text-style="eyebrow">a</p><h2 data-text-style="pull-quote">b</h2><p>c</p>');
    });

    it('sets and clears the style of the paragraphs in the selection', () => {
        const ed = makeEditor('<p>one</p><p>two</p>');
        ed.chain().setTextSelection(2).setPpTextStyle('eyebrow').run();
        expect(ed.getHTML()).toBe('<p data-text-style="eyebrow">one</p><p>two</p>');

        ed.chain().setTextSelection(2).setPpTextStyle(null).run();
        expect(ed.getHTML()).toBe('<p>one</p><p>two</p>');
    });

    it('succeeds on a selection holding only paragraphs, and styles every block it spans', () => {
        const ed = makeEditor('<p>one</p><h2>two</h2><p>three</p>');
        expect(ed.commands.setTextSelection(2)).toBe(true);
        expect(ed.commands.setPpTextStyle('eyebrow')).toBe(true);
        ed.commands.setTextSelection({ from: 2, to: 12 });
        expect(ed.commands.setPpTextStyle('small')).toBe(true);
        expect(ed.getHTML()).toBe('<p data-text-style="small">one</p><h2 data-text-style="small">two</h2><p data-text-style="small">three</p>');
    });
});
