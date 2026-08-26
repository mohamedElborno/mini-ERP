"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { IconPhoto, IconTrash, IconUpload } from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Btn } from "./settingsShared";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];

export function CompanyLogoField({ orgGroupId }: { orgGroupId: Id<"groups"> }) {
  const t = useTranslations("settingsPage");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const branding = useQuery(api.groups.getGroupBranding, { id: orgGroupId });
  const generateUploadUrl = useMutation(api.groups.generateGroupLogoUploadUrl);
  const setGroupLogo = useMutation(api.groups.setGroupLogo);
  const removeGroupLogo = useMutation(api.groups.removeGroupLogo);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error(t("companyLogoInvalidType"));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(t("companyLogoTooLarge"));
      return;
    }

    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({ id: orgGroupId });
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) {
        throw new Error(t("companyLogoUploadFailed"));
      }
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      await setGroupLogo({
        id: orgGroupId,
        logoStorageId: storageId,
      });
      toast.success(t("companyLogoUploaded"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await removeGroupLogo({ id: orgGroupId });
      toast.success(t("companyLogoRemoved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div>
      <div className="text-muted-foreground mb-2 text-sm">{t("companyLogoLabel")}</div>
      <p className="text-muted-foreground mb-3 text-xs">{t("companyLogoEditHint")}</p>
      <div className="border-border bg-muted/20 flex min-h-30 items-center justify-center rounded-xl border border-dashed p-4">
        {branding?.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt=""
            className="max-h-24 max-w-55 object-contain"
          />
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-2 text-sm">
            <IconPhoto className="h-8 w-8 opacity-60" />
            <span>{t("companyLogoEmpty")}</span>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <Btn
          disabled={uploading || removing}
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="inline-flex items-center gap-2">
            <IconUpload className="h-4 w-4" />
            {uploading ? t("companyLogoUploading") : t("companyLogoUpload")}
          </span>
        </Btn>
        {branding?.logoUrl ? (
          <Btn variant="danger" disabled={uploading || removing} onClick={handleRemove}>
            <span className="inline-flex items-center gap-2">
              <IconTrash className="h-4 w-4" />
              {removing ? t("companyLogoRemoving") : t("companyLogoRemove")}
            </span>
          </Btn>
        ) : null}
      </div>

      <p className="text-muted-foreground mt-2 text-xs">{t("companyLogoFormatsHint")}</p>
    </div>
  );
}
