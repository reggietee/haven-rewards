export const brandPaths = {
  haven: "/brand/haven.png",
  nfih: "/brand/nfih-logo.png",
  zannes: "/brand/zannes.png",
  storymode: "/brand/storymode-logo-dark.svg",
};
export function Brand({
  name,
  className = "",
}: {
  name: keyof typeof brandPaths;
  className?: string;
}) {
  return (
    <img
      className={`brand brand-${name} ${className}`}
      src={brandPaths[name]}
      alt={
        {
          haven: "Haven Workspace",
          nfih: "Niagara Falls Innovation Hub",
          zannes: "Zannes Law Firm",
          storymode: "Story Mode",
        }[name]
      }
    />
  );
}
export function Sponsors() {
  return (
    <div className="sponsors">
      <span>WITH PRIZES FROM</span>
      <Brand name="nfih" />
      <Brand name="zannes" />
      <Brand name="storymode" />
    </div>
  );
}
