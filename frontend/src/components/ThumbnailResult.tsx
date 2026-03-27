interface ThumbnailResultProps {
  imageBase64?: string;
  error?: string;
  onRetry?: () => void;
}

function downloadImage(base64: string, filename = "thumbnail.jpg") {
  const link = document.createElement("a");
  link.href = `data:image/jpeg;base64,${base64}`;
  link.download = filename;
  link.click();
}

export function ThumbnailResult({
  imageBase64,
  error,
  onRetry,
}: ThumbnailResultProps) {
  if (error) {
    return (
      <div className="thumbnail-result thumbnail-result--error">
        <p className="thumbnail-result__error-message">{error}</p>
        {onRetry && (
          <button
            type="button"
            className="thumbnail-result__retry"
            onClick={onRetry}
          >
            もう一度試す
          </button>
        )}
      </div>
    );
  }

  if (!imageBase64) {
    return null;
  }

  const dataUrl = `data:image/jpeg;base64,${imageBase64}`;

  return (
    <div className="thumbnail-result">
      <div className="thumbnail-result__preview">
        <img
          src={dataUrl}
          alt="生成されたサムネイル"
          className="thumbnail-result__image"
        />
      </div>
      <button
        type="button"
        className="thumbnail-result__download"
        onClick={() => downloadImage(imageBase64)}
      >
        ダウンロード
      </button>
    </div>
  );
}
