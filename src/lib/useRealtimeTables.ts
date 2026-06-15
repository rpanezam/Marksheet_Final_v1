/**
 * useRealtimeTables.ts — Supabase Realtime সাবস্ক্রিপশন হুক।
 *
 * কেন ব্যবহার করা হচ্ছে:
 *   একটি ডিভাইস থেকে ডেটা পরিবর্তন হলে অন্য ডিভাইসে
 *   manual refresh ছাড়াই automatically আপডেট দেখানোর জন্য।
 *   যেমন: একজন teacher marksheet save করলে admin এর screen এও দেখাবে।
 *
 * Debounce: একই table এ বহু rapid event (যেমন bulk insert 500 rows)
 * এলে সবগুলো একসাথে একটি callback এ merge করা হয়। এতে 500 বার
 * DB reload হওয়ার বদলে মাত্র একবার হবে।
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEBOUNCE_MS = 400;

export function useRealtimeTables(tables: string[], onChange: (table: string) => void) {
  // onChange কে ref এ রাখা হচ্ছে যাতে effect বারবার re-run না হয়
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // প্রতিটি table এর জন্য আলাদা debounce timer রাখা হচ্ছে
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!tables.length) return;

    // প্রতিটি subscription এর জন্য unique channel name দরকার
    const channelName = `rt:${tables.join(",")}:${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase.channel(channelName);

    // প্রতিটি table এর INSERT/UPDATE/DELETE event এ debounced onChange call
    for (const table of tables) {
      (
        channel as unknown as {
          on: (ev: string, opts: Record<string, unknown>, cb: () => void) => void;
        }
      ).on("postgres_changes", { event: "*", schema: "public", table }, () => {
        // আগের pending timer বাতিল করে নতুন timer সেট করা হয়
        clearTimeout(timersRef.current[table]);
        timersRef.current[table] = setTimeout(() => {
          onChangeRef.current(table);
        }, DEBOUNCE_MS);
      });
    }

    channel.subscribe();

    // Component unmount হলে channel unsubscribe ও সব pending timer clear
    return () => {
      void supabase.removeChannel(channel);
      for (const timer of Object.values(timersRef.current)) {
        clearTimeout(timer);
      }
      timersRef.current = {};
    };
  }, [tables.join("|")]); // tables পরিবর্তন হলেই নতুন subscription তৈরি হবে
}
